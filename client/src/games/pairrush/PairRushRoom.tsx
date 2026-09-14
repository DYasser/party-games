import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { RoomView } from '@shared/room';
import {
  BOARD_SIZES,
  MAX_ROUND_SECONDS,
  MIN_ROUND_SECONDS,
  type PairRushPlayer,
  type PairRushView,
} from '@shared/pairrush/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import Select from '../../lib/Select';
import { getSavedName, saveName } from '../../lib/socket';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import { formatClock, secondsLeft, useServerClock } from '../../lib/useServerClock';
import Board from './Board';
import Results, { formatRaceTime } from './Results';
import Standings from './Standings';
import './pairrush.css';

type PairRushRoomView = RoomView<PairRushPlayer, PairRushView>;

export default function PairRushRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<PairRushRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  // Hooks must stay above the early returns: React identifies a hook by call
  // order, so one placed after a conditional return crashes as soon as the room
  // connects. The clock is pinned once so the countdown ticks smoothly.
  const serverNow = room?.state.serverNow ?? Date.now();
  const now = useServerClock(serverNow);

  if (game && game !== 'pairrush') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/pairrush" className="btn">
          Back to Pair Rush
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/pairrush" className="btn">
          Back to Pair Rush
        </Link>
      </div>
    );
  }

  if (!room) return <div className="card center-card muted">Connecting to room {code}…</div>;

  const { you, state, players } = room;
  const isHost = room.hostId === you.id;
  const connected = players.filter((p) => p.connected);
  const inLobby = state.phase === 'lobby';
  const racing = state.phase === 'playing';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const start = () => act((ack) => socket.emit('pairrush:start', ack));
  const flip = (index: number) => act((ack) => socket.emit('pairrush:flip', { index }, ack));
  const onSettings = (patch: { size?: number; roundSeconds?: number }) =>
    act((ack) => socket.emit('pairrush:settings', patch, ack));

  const reset = async () => {
    const ok = await ask('This abandons the current race for everyone.', {
      title: 'Back to the lobby?',
      confirmLabel: 'Back to lobby',
    });
    if (ok) act((ack) => socket.emit('pairrush:reset', ack));
  };

  // Locked while a mismatched pair is still face-up, and once you have finished.
  const peeking = state.peekUntil !== null && now < state.peekUntil;
  const canFlip = racing && state.finishOrder === null && !peeking;
  const left = state.endsAt === null ? null : secondsLeft(state.endsAt, now);

  return (
    <div className="room pairrush">
      {dialog}

      <div className="room-bar">
        <div className="room-code">
          <span className="muted">Room</span> <strong>{room.code}</strong>
          <button className="btn small ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        <div className="room-status">
          {inLobby && <span className="muted">Lobby · {connected.length} online</span>}
          {racing && (
            <span className="turn-pill spy">
              {state.pairsFound}/{state.pairsTotal} pairs
              {left !== null && (
                <span className={`turn-clock ${left <= 15 ? 'urgent' : ''}`}>{formatClock(left)}</span>
              )}
            </span>
          )}
          {state.phase === 'ended' && <span>Race over</span>}
        </div>

        <div className="room-actions">
          {isHost && inLobby && (
            <>
              <button className="btn small ghost" onClick={() => act((a) => socket.emit('room:addBot', a))}>
                + Bot
              </button>
              <button className="btn primary" onClick={start}>
                Start
              </button>
            </>
          )}
          {isHost && !inLobby && (
            <button className="btn small ghost" onClick={reset}>
              {state.phase === 'ended' ? 'New race' : 'Back to lobby'}
            </button>
          )}
        </div>
      </div>

      {state.phase === 'ended' ? (
        <Results
          state={state}
          you={you}
          isHost={isHost}
          onAgain={() => act((ack) => socket.emit('pairrush:reset', ack))}
        />
      ) : (
        <div className="pr-layout">
          <section className="pr-main">
            {inLobby ? (
              <Lobby room={room} isHost={isHost} onSettings={onSettings} />
            ) : (
              <>
                {state.finishOrder !== null && (
                  <div className="banner pr-done" role="status">
                    <strong>
                      {state.finishOrder === 1 ? 'You won the race!' : `Finished #${state.finishOrder}`}
                    </strong>{' '}
                    {state.finishMs !== null && <>{formatRaceTime(state.finishMs)} · </>}
                    {state.attempts} flips
                  </div>
                )}

                <Board cards={state.cards} size={state.size} canFlip={canFlip} onFlip={flip} />
              </>
            )}
          </section>

          <aside className="pr-side">
            <Standings state={state} you={you} />
          </aside>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({
  room,
  isHost,
  onSettings,
}: {
  room: PairRushRoomView;
  isHost: boolean;
  onSettings: (patch: { size?: number; roundSeconds?: number }) => void;
}) {
  const { players, state } = room;
  const { size, roundSeconds } = state.settings;
  const pairs = (size * size) / 2;

  return (
    <div className="lobby-center">
      <h2>Waiting room</h2>
      <p className="muted">
        Share the room code, then start when everyone is in. Everybody races the same {size}×{size} grid —{' '}
        {pairs} pairs — so nobody gets an easier board.
      </p>

      <div className="player-list pr-lobby-players">
        {players.map((p) => (
          <div key={p.id} className={`player-row ${p.connected ? '' : 'offline'}`}>
            <span className="player-name">
              {p.name}
              {p.id === room.you.id && <span className="muted"> (you)</span>}
            </span>
            {p.isBot && <span className="tag bot">bot</span>}
            {p.id === room.hostId && <span className="tag">host</span>}
          </div>
        ))}
      </div>

      <div className="pr-lobby-settings">
        <GameSettings isHost={isHost} summary={`${size}×${size} · ${pairs} pairs · ${Math.round(roundSeconds / 60)} min`}>
          <div className="numfield">
            <span className="numfield-label">Board size</span>
            <Select
              label="Board size"
              value={String(size)}
              disabled={!isHost}
              onChange={(v) => onSettings({ size: Number(v) })}
              options={BOARD_SIZES.map((n) => ({
                value: String(n),
                label: `${n} × ${n}`,
                hint: `${(n * n) / 2} pairs`,
              }))}
            />
            <span className="numfield-hint">Bigger grids are a real memory test.</span>
          </div>

          <NumberField
            label="Time limit"
            value={Math.round(roundSeconds / 60)}
            min={Math.ceil(MIN_ROUND_SECONDS / 60)}
            max={Math.floor(MAX_ROUND_SECONDS / 60)}
            suffix="min"
            hint="The race is called if nobody finishes."
            disabled={!isHost}
            onCommit={(v) => onSettings({ roundSeconds: v * 60 })}
          />
        </GameSettings>
      </div>
    </div>
  );
}
