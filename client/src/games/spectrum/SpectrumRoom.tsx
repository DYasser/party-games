import { useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MAX_ROUNDS, MIN_PLAYERS, MIN_ROUNDS, type SpectrumRoomView } from '@shared/spectrum/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
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
        <Lobby room={room} isHost={isHost} onSettings={(rounds) => act((ack) => socket.emit('spectrum:settings', { rounds }, ack))} />
      )}

      {inRound && state.round && <SpectrumPlay room={room} act={act} socket={socket} />}

      {state.phase === 'ended' && <Ended room={room} isHost={isHost} onReset={reset} socket={socket} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({ room, isHost, onSettings }: { room: SpectrumRoomView; isHost: boolean; onSettings: (rounds: number) => void }) {
  const { players, you, state } = room;
  const connected = players.filter((p) => p.connected);
  const hasHuman = connected.some((p) => !p.isBot);

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

      <GameSettings isHost={isHost} summary={`${state.settings.rounds} rounds`}>
        <NumberField
          label="Rounds"
          value={state.settings.rounds}
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          suffix="rounds"
          disabled={!isHost}
          onCommit={onSettings}
        />

        <p className="muted small-text settings-row-full">
          The psychic role passes between the human players each round. Bots only guess. Guessers get 60 seconds once the
          clue is in.
        </p>
      </GameSettings>
    </div>
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
