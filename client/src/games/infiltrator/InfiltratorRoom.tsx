import { useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MAX_ROUND_SECONDS, MIN_PLAYERS, MIN_ROUND_SECONDS, type InfiltratorRoomView } from '@shared/infiltrator/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import { getSavedName, saveName } from '../../lib/socket';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import InfiltratorPlaying from './InfiltratorPlaying';
import InfiltratorResults from './InfiltratorResults';

export default function InfiltratorRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<InfiltratorRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  if (game && game !== 'infiltrator') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/infiltrator" className="btn">
          Back to Infiltrator
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/infiltrator" className="btn">
          Back to Infiltrator
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

  const start = () => act((ack) => socket.emit('infiltrator:start', ack));

  return (
    <div className="room infiltrator">
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
          {state.phase === 'playing' && <span className="turn-pill spy">Round {state.round?.number} in progress</span>}
          {state.phase === 'voting' && <span className="turn-pill red">Time&apos;s up · final vote</span>}
          {state.phase === 'ended' && <span>Round {state.round?.number} over</span>}
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
          {isHost && (state.phase === 'lobby' || state.phase === 'ended') && (
            <button
              className="btn small primary"
              onClick={start}
              disabled={!canStart}
              title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players`}
            >
              {state.phase === 'lobby' ? 'Start round' : 'Next round'}
            </button>
          )}
          {isHost && state.phase === 'voting' && (
            <button className="btn small" onClick={() => act((ack) => socket.emit('infiltrator:reveal', ack))}>
              Reveal now
            </button>
          )}
          {isHost && state.phase !== 'lobby' && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  await ask('Return to the lobby and clear all scores?', {
                    title: 'Return to lobby?',
                    confirmLabel: 'Return to lobby',
                  })
                ) {
                  void act((ack) => socket.emit('infiltrator:reset', ack));
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
          onSettings={(roundSeconds) => act((ack) => socket.emit('infiltrator:settings', { roundSeconds }, ack))}
        />
      )}

      {(state.phase === 'playing' || state.phase === 'voting') && <InfiltratorPlaying room={room} act={act} socket={socket} />}

      {state.phase === 'ended' && <InfiltratorResults room={room} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({
  room,
  isHost,
  onSettings,
}: {
  room: InfiltratorRoomView;
  isHost: boolean;
  onSettings: (roundSeconds: number) => void;
}) {
  const { players, you, state } = room;
  const minutes = Math.round(state.settings.roundSeconds / 60);
  const hasScores = Object.values(state.scores).some((s) => s > 0);

  return (
    <div className="spy-lobby">
      <section className="card">
        <h3>Players ({players.length})</h3>
        <ul className="player-list">
          {players.map((p) => (
            <li key={p.id} className={`player-row ${p.connected ? '' : 'offline'}`}>
              <span className="player-name">
                {p.name}
                {p.id === you.id && <span className="muted"> (you)</span>}
              </span>
              {hasScores && <span className="score">{state.scores[p.id] ?? 0} pts</span>}
              {p.isBot && <span className="tag bot">bot</span>}
              {p.id === room.hostId && <span className="tag">host</span>}
              {!p.connected && <span className="tag">away</span>}
            </li>
          ))}
        </ul>
        {players.filter((p) => p.connected).length < MIN_PLAYERS && (
          <p className="hint">You need at least {MIN_PLAYERS} players. Share the room code!</p>
        )}
      </section>

      <GameSettings isHost={isHost} summary={`${minutes} min rounds`}>
        <NumberField
          label="Round length"
          value={minutes}
          min={Math.ceil(MIN_ROUND_SECONDS / 60)}
          max={Math.floor(MAX_ROUND_SECONDS / 60)}
          suffix="min"
          disabled={!isHost}
          onCommit={(m) => onSettings(m * 60)}
        />

        <p className="muted small-text settings-row-full">
          Everyone who is online when the host starts joins the round. One player is secretly the spy.
        </p>
      </GameSettings>
    </div>
  );
}
