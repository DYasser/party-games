import { useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MAX_ROUNDS, MIN_PLAYERS, MIN_ROUNDS, type SpectrumRoomView } from '@shared/spectrum/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import Select from '../../lib/Select';
import Podium, { type PodiumEntry } from '../../lib/Podium';
import { getSavedName, saveName, type AppSocket } from '../../lib/socket';
import { useCelebration } from '../../lib/useCelebration';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import SpectrumPlay from './SpectrumPlay';
import './spectrum.css';

export default function SpectrumRoom() {
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();
  const [name, setName] = useState<string | null>(() => getSavedName() || null);

  if (!name) return <NamePrompt onSubmit={setName} />;
  return <RoomInner code={roomCode} name={name} />;
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = value.trim();
    if (!n) return;
    saveName(n);
    onSubmit(n);
  };
  return (
    <form className="card center-card" onSubmit={submit}>
      <h2>What should we call you?</h2>
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={20} placeholder="Your name" autoFocus />
      <button className="btn primary" type="submit">
        Join room
      </button>
    </form>
  );
}

function RoomInner({ code, name }: { code: string; name: string }) {
  const { room, game, status, error, closed, toast, act, socket } = useRoom<SpectrumRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  if (game && game !== 'spectrum') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/spectrum" className="btn">
          Back to Spectrum
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/spectrum" className="btn">
          Back to Spectrum
        </Link>
      </div>
    );
  }

  if (!room) return <div className="card center-card muted">Connecting to room {code}…</div>;

  const { you, state, players } = room;
  const isHost = room.hostId === you.id;
  const connected = players.filter((p) => p.connected);
  const hasHuman = connected.some((p) => !p.isBot);
  const canStart = connected.length >= MIN_PLAYERS && hasHuman;
  const inRound = state.phase === 'clue' || state.phase === 'guessing' || state.phase === 'reveal';
  const psychicName = players.find((p) => p.id === state.round?.psychicId)?.name ?? '—';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const start = () => act((ack) => socket.emit('spectrum:start', ack));
  const reset = () => act((ack) => socket.emit('spectrum:reset', ack));

  return (
    <div className="room spectrum">
      {dialog}
      <div className="room-bar">
        <div className="room-code">
          <span className="muted">Room</span> <strong>{room.code}</strong>
          <button className="btn small ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
        <div className="room-status">
          {state.phase === 'lobby' && <span className="muted">Lobby · {connected.length} online</span>}
          {inRound && state.round && (
            <span className="turn-pill spectrum-pill">
              Round {state.round.number}/{state.settings.rounds} · Psychic: {psychicName}
            </span>
          )}
          {state.phase === 'ended' && <span className="turn-pill spectrum-pill">Game over</span>}
        </div>
        <div className="room-actions">
          {isHost && state.phase === 'lobby' && (
            <>
              <button
                className="btn small ghost"
                onClick={() => act((ack) => socket.emit('room:addBot', ack))}
                title="Add a computer player to fill a seat"
              >
                + Bot
              </button>
              {players.some((p) => p.isBot) && (
                <button className="btn small ghost" onClick={() => act((ack) => socket.emit('room:removeBots', ack))}>
                  Remove bots
                </button>
              )}
              <button
                className="btn small primary"
                onClick={start}
                disabled={!canStart}
                title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players, including one human`}
              >
                Start game
              </button>
            </>
          )}
          {isHost && state.phase === 'ended' && (
            <button className="btn small primary" onClick={reset}>
              Play again
            </button>
          )}
          {isHost && inRound && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  await ask('Return to the lobby and clear all scores?', {
                    title: 'Return to lobby?',
                    confirmLabel: 'Return to lobby',
                  })
                ) {
                  void reset();
                }
              }}
            >
              Reset
            </button>
          )}
          {!isHost && state.phase === 'lobby' && <span className="muted small-text">Waiting for the host to start…</span>}
        </div>
      </div>

      {state.phase === 'lobby' && (
        <Lobby
          room={room}
          isHost={isHost}
          onSettings={(patch) => act((ack) => socket.emit('spectrum:settings', patch, ack))}
          onTeam={(playerId, team) => act((ack) => socket.emit('spectrum:team', { playerId, team }, ack))}
          onShuffle={() => act((ack) => socket.emit('spectrum:shuffleTeams', ack))}
        />
      )}

      {inRound && state.round && <SpectrumPlay room={room} act={act} socket={socket} />}

      {state.phase === 'ended' && <Ended room={room} isHost={isHost} onReset={reset} socket={socket} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({
  room,
  isHost,
  onSettings,
  onTeam,
  onShuffle,
}: {
  room: SpectrumRoomView;
  isHost: boolean;
  onSettings: (patch: { rounds?: number; mode?: string }) => void;
  onTeam: (playerId: string, team: string | null) => void;
  onShuffle: () => void;
}) {
  const { players, you, state } = room;
  const connected = players.filter((p) => p.connected);
  const hasHuman = connected.some((p) => !p.isBot);
  const mode = state.settings.mode;

  return (
    <div className="spectrum-lobby">
      <section className="card">
        <h3>Players ({players.length})</h3>
        <ul className="player-list">
          {players.map((p) => (
            <li key={p.id} className={`player-row ${p.connected ? '' : 'offline'}`}>
              <span className="player-name">
                {p.name}
                {p.id === you.id && <span className="muted"> (you)</span>}
              </span>
              {p.isBot && <span className="tag bot">bot</span>}
              {p.id === room.hostId && <span className="tag">host</span>}
              {!p.connected && <span className="tag">away</span>}
            </li>
          ))}
        </ul>
        {connected.length < MIN_PLAYERS && <p className="hint">You need at least {MIN_PLAYERS} players. Share the room code or add bots!</p>}
        {connected.length >= MIN_PLAYERS && !hasHuman && <p className="hint">At least one human is needed to be the psychic.</p>}
      </section>

      {mode === 'teams' && (
        <TeamPicker room={room} isHost={isHost} onTeam={onTeam} onShuffle={onShuffle} />
      )}

      <GameSettings isHost={isHost} summary={`${MODE_LABEL[mode]} · ${state.settings.rounds} rounds`}>
        <div className="numfield settings-row-full">
          <span className="numfield-label">Game mode</span>
          <Select
            label="Game mode"
            value={mode}
            disabled={!isHost}
            onChange={(v) => onSettings({ mode: v })}
            options={[
              { value: 'classic', label: 'Classic', hint: 'Both ends named' },
              { value: 'blind', label: 'Blind', hint: 'Ends hidden — harder' },
              { value: 'teams', label: 'Teams', hint: 'Two sides take turns' },
            ]}
          />
          <span className="numfield-hint">{MODE_HINT[mode]}</span>
        </div>

        <NumberField
          label="Rounds"
          value={state.settings.rounds}
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          suffix="rounds"
          disabled={!isHost}
          onCommit={(rounds) => onSettings({ rounds })}
        />

        <p className="muted small-text settings-row-full">
          The psychic role passes between the human players each round. Bots only guess. Guessers get 60 seconds once the
          clue is in.
        </p>
      </GameSettings>
    </div>
  );
}

/** One-line description of each mode, shown under the picker. */
const MODE_LABEL: Record<string, string> = {
  classic: 'Classic',
  blind: 'Blind',
  teams: 'Teams',
};

const MODE_HINT: Record<string, string> = {
  classic: 'The two ends of the scale are named. Everyone guesses and scores for themselves.',
  blind: 'The ends are never shown, not even to the psychic. The clue is the only information anyone has.',
  teams: 'Two sides take turns. Only the psychic’s own team guesses, and their points go to the team.',
};

/**
 * Team assignment for the lobby.
 *
 * Drag a player onto a side, or tap a player then tap a side — HTML5 drag does
 * nothing on a touch screen, and the lobby has to work on a phone.
 */
function TeamPicker({
  room,
  isHost,
  onTeam,
  onShuffle,
}: {
  room: SpectrumRoomView;
  isHost: boolean;
  onTeam: (playerId: string, team: string | null) => void;
  onShuffle: () => void;
}) {
  const { players, state } = room;
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const place = (playerId: string, team: string | null) => {
    setHeld(null);
    setOver(null);
    if (!isHost) return;
    if ((state.teams[playerId] ?? null) === team) return; // already there
    onTeam(playerId, team);
  };

  const zone = (key: string, team: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragEnter: () => setOver(key),
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || held;
      if (id) place(id, team);
    },
    onClick: (e: React.MouseEvent) => {
      // A click already handled by a chip must not also drop it here.
      if ((e.nativeEvent as MouseEvent & { chipHandled?: boolean }).chipHandled) return;
      if (held) place(held, team);
    },
  });

  const chip = (p: SpectrumRoomView['players'][number]) => (
    <div
      key={p.id}
      className={`spectrum-team-chip ${isHost ? 'movable' : ''} ${held === p.id ? 'lifted' : ''}`}
      draggable={isHost}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
        setHeld(p.id);
      }}
      onDragEnd={() => {
        setHeld(null);
        setOver(null);
      }}
      onClick={(e) => {
        (e.nativeEvent as MouseEvent & { chipHandled?: boolean }).chipHandled = true;
        if (isHost) setHeld((cur) => (cur === p.id ? null : p.id));
      }}
    >
      <span className="player-name">{p.name}</span>
      {p.isBot && <span className="tag bot">bot</span>}
    </div>
  );

  const side = (team: 'red' | 'blue') =>
    players.filter((p) => p.connected && state.teams[p.id] === team);
  const bench = players.filter((p) => p.connected && !state.teams[p.id]);

  return (
    <section className="card spectrum-teams">
      <div className="spectrum-teams-head">
        <h3>Teams</h3>
        {isHost && (
          <button className="btn small ghost" onClick={onShuffle}>
            Shuffle
          </button>
        )}
      </div>

      <div className="spectrum-team-grid">
        {(['red', 'blue'] as const).map((team) => (
          <div
            key={team}
            className={`spectrum-team ${team} ${held ? 'armed' : ''} ${over === team ? 'over' : ''}`}
            {...zone(team, team)}
          >
            <span className="spectrum-team-name">{team === 'red' ? 'Red' : 'Blue'}</span>
            {side(team).map(chip)}
            {side(team).length === 0 && (
              <span className="muted small-text">{held ? 'Drop here' : 'Nobody yet'}</span>
            )}
          </div>
        ))}
      </div>

      <div
        className={`spectrum-bench ${held ? 'armed' : ''} ${over === 'bench' ? 'over' : ''}`}
        {...zone('bench', null)}
      >
        <span className="spectrum-team-name">Not playing</span>
        {bench.map(chip)}
        {bench.length === 0 && (
          <span className="muted small-text">{held ? 'Drop here to bench them' : 'Everyone is on a side'}</span>
        )}
      </div>

      {isHost && <p className="muted small-text">Drag a player onto a side, or tap them and then tap a side.</p>}
    </section>
  );
}

function Ended({
  room,
  isHost,
  onReset,
  socket,
}: {
  room: SpectrumRoomView;
  isHost: boolean;
  onReset: () => void;
  socket: AppSocket;
}) {
  const { players, you, state } = room;
  // Only mounted on the ended screen, so the celebration channel is always live here.
  const celebration = useCelebration(socket, true);
  const entries: PodiumEntry[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    score: state.scores[p.id] ?? 0,
    isBot: p.isBot,
    isYou: p.id === you.id,
  }));

  return (
    <div className="spectrum-ended">
      <div className="card">
        <Podium entries={entries} unit="pts" celebration={celebration}>
          <p className="muted small-text">
            {state.roundsPlayed} round{state.roundsPlayed === 1 ? '' : 's'} played
          </p>
          <div className="podium-actions">
            {isHost ? (
              <button className="btn primary big" onClick={onReset}>
                Play again
              </button>
            ) : (
              <p className="muted small-text">Waiting for the host to start another game…</p>
            )}
          </div>
        </Podium>
      </div>
    </div>
  );
}
