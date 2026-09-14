import { useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { roleCounts } from '@shared/nightfall/logic';
import {
  MAX_DAY_SECONDS,
  MAX_NIGHT_SECONDS,
  MIN_DAY_SECONDS,
  MIN_NIGHT_SECONDS,
  MIN_PLAYERS,
  MIN_VOTE_LOCK_SECONDS,
  ROLE_INFO,
  maxVoteLockFor,
  type NightfallRoomView,
  type NightfallSettings,
} from '@shared/nightfall/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import { useConfirm } from '../../lib/useConfirm';
import { getSavedName, saveName } from '../../lib/socket';
import { useRoom } from '../../lib/useRoom';
import NightfallPlay from './NightfallPlay';
import NightfallResults from './NightfallResults';
import './nightfall.css';
import './cards.css';
import './dawn.css';

export default function NightfallRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<NightfallRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  if (game && game !== 'nightfall') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/nightfall" className="btn">
          Back to Nightfall
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/nightfall" className="btn">
          Back to Nightfall
        </Link>
      </div>
    );
  }

  if (!room) return <div className="card center-card muted">Connecting to room {code}…</div>;

  const { you, state, players } = room;
  const isHost = room.hostId === you.id;
  const connected = players.filter((p) => p.connected);
  const canStart = connected.length >= MIN_PLAYERS;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const start = () => act((ack) => socket.emit('nightfall:start', ack));
  const phaseClass = state.phase === 'night' ? 'nightfall-night' : state.phase === 'day' ? 'nightfall-day' : '';

  return (
    <div className={`room nightfall ${phaseClass}`}>
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
          {state.phase === 'night' && <span className="turn-pill spy">Night {state.dayNumber}</span>}
          {state.phase === 'day' && <span className="turn-pill blue">Day {state.dayNumber}</span>}
          {state.phase === 'ended' && <span className={`turn-pill ${state.winner === 'shades' ? 'red' : 'blue'}`}>Game over</span>}
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
            </>
          )}
          {isHost && state.phase === 'lobby' && (
            <button
              className="btn small primary"
              onClick={start}
              disabled={!canStart}
              title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players`}
            >
              Start game
            </button>
          )}
          {isHost && state.phase === 'day' && state.settings.hostCanCallVote && (
            <button className="btn small" onClick={() => act((ack) => socket.emit('nightfall:callVote', ack))}>
              Call the vote
            </button>
          )}
          {isHost && state.phase === 'ended' && (
            <button className="btn small primary" onClick={() => act((ack) => socket.emit('nightfall:reset', ack))}>
              Play again
            </button>
          )}
          {isHost && (state.phase === 'night' || state.phase === 'day') && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  await ask('Everyone loses their role and the game returns to the lobby.', {
                    title: 'Abandon game?',
                    confirmLabel: 'Abandon',
                  })
                ) {
                  void act((ack) => socket.emit('nightfall:reset', ack));
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
          onSettings={(patch) => act((ack) => socket.emit('nightfall:settings', patch, ack))}
        />
      )}

      {(state.phase === 'night' || state.phase === 'day') && <NightfallPlay room={room} act={act} socket={socket} />}

      {state.phase === 'ended' && <NightfallResults room={room} socket={socket} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({
  room,
  isHost,
  onSettings,
}: {
  room: NightfallRoomView;
  isHost: boolean;
  onSettings: (patch: Partial<NightfallSettings>) => void;
}) {
  const { players, you, state } = room;
  const connected = players.filter((p) => p.connected).length;
  const counts = roleCounts(Math.max(MIN_PLAYERS, connected));
  // The discussion lock can only ever be a fraction of the day.
  const dayMinutes = Math.round(state.settings.daySeconds / 60);
  const lockCap = maxVoteLockFor(state.settings.daySeconds);

  return (
    <div className="nightfall-lobby">
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
        {connected < MIN_PLAYERS && <p className="hint">You need at least {MIN_PLAYERS} players. Share the room code or add bots!</p>}
      </section>

      <div className="nightfall-lobby-side">
        <GameSettings
            isHost={isHost}
            summary={`${Math.round(state.settings.daySeconds / 60)} min day · ${state.settings.nightSeconds}s turns`}
          >
            <p className="settings-section-label">Night</p>
            <NumberField
              label="Each role's turn"
              value={state.settings.nightSeconds}
              min={MIN_NIGHT_SECONDS}
              max={MAX_NIGHT_SECONDS}
              step={15}
              suffix="sec"
              hint={`${MIN_NIGHT_SECONDS}–${MAX_NIGHT_SECONDS}, per role`}
              disabled={!isHost}
              onCommit={(v) => onSettings({ nightSeconds: v })}
            />

            <p className="settings-section-label">Day</p>
            <NumberField
              label="Discussion before voting"
              value={state.settings.voteLockSeconds}
              min={MIN_VOTE_LOCK_SECONDS}
              /* Capped by the day: the lock must leave time to actually vote. */
              max={lockCap}
              step={5}
              suffix="sec"
              hint={lockCap === 0 ? 'the day is too short for a lock' : `0–${lockCap} for a ${dayMinutes} min day`}
              disabled={!isHost}
              onCommit={(v) => onSettings({ voteLockSeconds: v })}
            />
            <NumberField
              label="Day length"
              value={Math.round(state.settings.daySeconds / 60)}
              min={Math.ceil(MIN_DAY_SECONDS / 60)}
              max={Math.floor(MAX_DAY_SECONDS / 60)}
              suffix="min"
              disabled={!isHost}
              onCommit={(m) => onSettings({ daySeconds: m * 60 })}
            />

            <label className="settings-toggle settings-row-full">
              <input
                type="checkbox"
                checked={state.settings.hostCanCallVote}
                disabled={!isHost}
                onChange={(e) => onSettings({ hostCanCallVote: e.target.checked })}
              />
              <span className="settings-toggle-text">
                <strong>Host can end the discussion early</strong>
                <span>Adds a &ldquo;Call the vote&rdquo; button that resolves the day with the votes already in.</span>
              </span>
            </label>

            <p className="muted small-text settings-row-full">
              Everyone who is online when the host starts is dealt into the game.
            </p>
        </GameSettings>

        <section className="card nightfall-roles-card">
          <h3>Roles for {Math.max(MIN_PLAYERS, connected)} players</h3>
          <ul className="nightfall-role-summary">
            <li className="shades">
              <span className="nightfall-role-count">{counts.shade}</span>
              <div>
                <strong>{counts.shade === 1 ? 'Shade' : 'Shades'}</strong>
                <span>{ROLE_INFO.shade.power}</span>
              </div>
            </li>
            <li className="town">
              <span className="nightfall-role-count">{counts.oracle}</span>
              <div>
                <strong>Oracle</strong>
                <span>{ROLE_INFO.oracle.power}</span>
              </div>
            </li>
            <li className={`town ${counts.healer === 0 ? 'absent' : ''}`}>
              <span className="nightfall-role-count">{counts.healer}</span>
              <div>
                <strong>Healer</strong>
                <span>{counts.healer === 0 ? 'Joins the table from 5 players.' : ROLE_INFO.healer.power}</span>
              </div>
            </li>
            <li className="town">
              <span className="nightfall-role-count">{counts.townsfolk}</span>
              <div>
                <strong>Townsfolk</strong>
                <span>{ROLE_INFO.townsfolk.power}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
