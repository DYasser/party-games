import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  MAX_ROUNDS,
  MAX_ROUND_SECONDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  MIN_ROUND_SECONDS,
  type LetterRushRoomView,
} from '@shared/letterrush/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import Podium, { type PodiumEntry } from '../../lib/Podium';
import { getSavedName, saveName, type AppSocket } from '../../lib/socket';
import { useCelebration } from '../../lib/useCelebration';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import { secondsLeft, useServerClock } from '../../lib/useServerClock';
import LetterRushReview from './LetterRushReview';
import LetterRushWriting from './LetterRushWriting';
import './letterrush.css';

export default function LetterRushRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<LetterRushRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  if (game && game !== 'letterrush') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/letterrush" className="btn">
          Back to Letter Rush
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/letterrush" className="btn">
          Back to Letter Rush
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

  return (
    <div className="room letterrush">
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
          {state.phase === 'writing' && (
            <span className="turn-pill red">
              Round {state.round?.number}/{state.settings.rounds} · Write!
            </span>
          )}
          {state.phase === 'review' && <span className="turn-pill spy">Round {state.round?.number} · Review</span>}
          {state.phase === 'scores' && <span className="turn-pill blue">Round {state.round?.number} scores</span>}
          {state.phase === 'ended' && <span>Game over</span>}
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
                onClick={() => act((ack) => socket.emit('letterrush:start', ack))}
                disabled={!canStart}
                title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players`}
              >
                Start
              </button>
            </>
          )}
          {isHost && state.phase === 'review' && (
            <button className="btn small" onClick={() => act((ack) => socket.emit('letterrush:finishReview', ack))}>
              Finish review
            </button>
          )}
          {isHost && state.phase === 'scores' && (
            <button className="btn small primary" onClick={() => act((ack) => socket.emit('letterrush:next', ack))}>
              {state.roundsPlayed >= state.settings.rounds ? 'Final results' : 'Next round'}
            </button>
          )}
          {isHost && state.phase === 'ended' && (
            <button className="btn small primary" onClick={() => act((ack) => socket.emit('letterrush:reset', ack))}>
              Play again
            </button>
          )}
          {isHost && state.phase !== 'lobby' && state.phase !== 'ended' && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  await ask('Return to the lobby and clear all scores?', {
                    title: 'Return to lobby?',
                    confirmLabel: 'Return to lobby',
                  })
                ) {
                  void act((ack) => socket.emit('letterrush:reset', ack));
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
          onSettings={(rounds, roundSeconds) => act((ack) => socket.emit('letterrush:settings', { rounds, roundSeconds }, ack))}
        />
      )}

      {state.phase === 'writing' && <LetterRushWriting key={`w${state.round?.number}`} room={room} act={act} socket={socket} />}

      {state.phase === 'review' && <LetterRushReview room={room} act={act} socket={socket} />}

      {state.phase === 'scores' && <RoundScores room={room} isHost={isHost} onNext={() => act((ack) => socket.emit('letterrush:next', ack))} />}

      {state.phase === 'ended' && (
        <Leaderboard
          room={room}
          isHost={isHost}
          onReset={() => act((ack) => socket.emit('letterrush:reset', ack))}
          socket={socket}
        />
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
  room: LetterRushRoomView;
  isHost: boolean;
  onSettings: (rounds: number, roundSeconds: number) => void;
}) {
  const { players, you, state } = room;
  const { rounds, roundSeconds } = state.settings;

  return (
    <div className="letterrush-lobby">
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
        {players.filter((p) => p.connected).length < MIN_PLAYERS && (
          <p className="hint">You need at least {MIN_PLAYERS} players. Share the room code or add a bot!</p>
        )}
      </section>

      <GameSettings isHost={isHost} summary={`${rounds} rounds · ${roundSeconds}s to write`}>
        <NumberField
          label="Rounds"
          value={rounds}
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          suffix="rounds"
          disabled={!isHost}
          onCommit={(n) => onSettings(n, roundSeconds)}
        />
        <NumberField
          label="Writing time"
          value={roundSeconds}
          min={MIN_ROUND_SECONDS}
          max={MAX_ROUND_SECONDS}
          step={15}
          suffix="sec"
          disabled={!isHost}
          onCommit={(s) => onSettings(rounds, s)}
        />

        <label className="field settings-row-full">
          <span>Categories per round</span>
          <strong>{state.settings.categoriesPerRound}</strong>
        </label>

        <p className="muted small-text settings-row-full">
          Everyone online when the host presses Start plays. Unique answers score 1 point each.
        </p>
      </GameSettings>
    </div>
  );
}

function RoundScores({ room, isHost, onNext }: { room: LetterRushRoomView; isHost: boolean; onNext: () => void }) {
  const { state, players, you } = room;
  const round = state.round!;
  const points = round.points ?? {};
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? round.names[id] ?? 'someone';
  const ids = useMemo(
    () => Object.keys(state.scores).sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0) || (points[b] ?? 0) - (points[a] ?? 0)),
    [state.scores, points],
  );
  const secondsLeft = useSecondsLeft(round.endsAt, state.serverNow);
  const last = state.roundsPlayed >= state.settings.rounds;

  return (
    <div className="letterrush-scores">
      <section className="card">
        <div className="section-head">
          <h3>Round {round.number} scores</h3>
          <span className="muted small-text">
            {last ? 'Final results' : 'Next round'} in {secondsLeft}s
          </span>
        </div>
        <table className="letterrush-scoretable">
          <thead>
            <tr>
              <th>Player</th>
              <th style={{ textAlign: 'right' }}>This round</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => (
              <tr key={id} className={id === you.id ? 'me' : ''}>
                <td>
                  {nameOf(id)}
                  {id === you.id && <span className="muted"> (you)</span>}
                  {players.find((p) => p.id === id)?.isBot && <span className="tag bot" style={{ marginLeft: '0.4rem' }}>bot</span>}
                </td>
                <td className="num gain">+{points[id] ?? 0}</td>
                <td className="num total">{state.scores[id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="letterrush-actions">
          <span className="muted small-text">
            Letter {round.letter} · {round.categories.join(' · ')}
          </span>
          {isHost && (
            <button className="btn primary" onClick={onNext}>
              {last ? 'Final results' : 'Next round'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Leaderboard({
  room,
  isHost,
  onReset,
  socket,
}: {
  room: LetterRushRoomView;
  isHost: boolean;
  onReset: () => void;
  socket: AppSocket;
}) {
  const { state, players, you } = room;
  // Only mounted on the ended screen, so the celebration channel is always live here.
  const celebration = useCelebration(socket, true);
  const names = state.round?.names ?? {};
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? names[id] ?? 'someone';
  const entries: PodiumEntry[] = Object.keys(state.scores).map((id) => ({
    id,
    name: nameOf(id),
    score: state.scores[id] ?? 0,
    isBot: players.find((p) => p.id === id)?.isBot,
    isYou: id === you.id,
  }));

  return (
    <div className="letterrush-scores">
      <div className="card">
        <Podium entries={entries} unit="pts" celebration={celebration}>
          <p className="letterrush-kicker" style={{ textAlign: 'center' }}>
            After {state.roundsPlayed} round{state.roundsPlayed === 1 ? '' : 's'}
          </p>
          <div className="podium-actions">
            {isHost ? (
              <button className="btn primary big" onClick={onReset}>
                Play again
              </button>
            ) : (
              <p className="muted small-text">Waiting for the host to start a new game…</p>
            )}
          </div>
        </Podium>
      </div>
    </div>
  );
}

function useSecondsLeft(endsAt: number, serverNow: number): number {
  return secondsLeft(endsAt, useServerClock(serverNow, 250));
}
