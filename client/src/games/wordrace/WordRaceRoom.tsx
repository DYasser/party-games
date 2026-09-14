import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Award } from '@shared/awards';
import {
  MAX_ROUND_SECONDS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUND_SECONDS,
  MIN_ROUNDS,
  type PlayerBoardView,
  type WordRaceRoomView,
  type WordRaceRoundView,
} from '@shared/wordrace/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import Podium, { type PodiumEntry } from '../../lib/Podium';
import { getSavedName, saveName } from '../../lib/socket';
import type { AppSocket } from '../../lib/socket';
import { useCelebration } from '../../lib/useCelebration';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom, type Act } from '../../lib/useRoom';
import { formatClock, secondsLeft, useServerClock } from '../../lib/useServerClock';
import Board from './Board';
import Keyboard, { letterStatuses } from './Keyboard';
import './wordrace.css';

type Players = WordRaceRoomView['players'];

export default function WordRaceRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<WordRaceRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();

  useEffect(() => {
    if (!localToast) return;
    const t = setTimeout(() => setLocalToast(null), 2500);
    return () => clearTimeout(t);
  }, [localToast]);

  if (game && game !== 'wordrace') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/wordrace" className="btn">
          Back to Word Race
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/wordrace" className="btn">
          Back to Word Race
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

  const start = () => act((ack) => socket.emit('wordrace:start', ack));
  const shownToast = toast ?? localToast;

  return (
    <div className="room wordrace">
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
          {state.phase === 'playing' && (
            <span className="turn-pill spy">
              Round {state.round?.number}/{state.settings.rounds}
            </span>
          )}
          {state.phase === 'reveal' && (
            <span className="turn-pill blue">
              Round {state.round?.number}/{state.settings.rounds} · reveal
            </span>
          )}
          {state.phase === 'ended' && <span>Game over</span>}
        </div>
        <div className="room-actions">
          {isHost && state.phase === 'lobby' && (
            <>
              <button
                className="btn small ghost"
                onClick={() => act((ack) => socket.emit('room:addBot', ack))}
                title="Add a computer player"
              >
                + Bot
              </button>
              {players.some((p) => p.isBot) && (
                <button className="btn small ghost" onClick={() => act((ack) => socket.emit('room:removeBots', ack))}>
                  Remove bots
                </button>
              )}
              <button className="btn small primary" onClick={start} disabled={!canStart}>
                Start
              </button>
            </>
          )}
          {isHost && state.phase === 'reveal' && (
            <button className="btn small primary" onClick={() => act((ack) => socket.emit('wordrace:next', ack))}>
              {state.roundsPlayed >= state.settings.rounds ? 'Show results' : 'Next round'}
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
                  void act((ack) => socket.emit('wordrace:reset', ack));
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
          onSettings={(patch) => act((ack) => socket.emit('wordrace:settings', patch, ack))}
          socket={socket}
          act={act}
        />
      )}

      {state.phase === 'playing' && state.round && (
        <Playing room={room} round={state.round} act={act} socket={socket} onLocalToast={setLocalToast} />
      )}

      {state.phase === 'reveal' && state.round && <Reveal room={room} round={state.round} />}

      {state.phase === 'ended' && <Ended room={room} isHost={isHost} act={act} socket={socket} />}

      {shownToast && <div className="toast">{shownToast}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby                                                               */
/* ------------------------------------------------------------------ */

function Lobby({
  room,
  isHost,
  onSettings,
  socket,
  act,
}: {
  room: WordRaceRoomView;
  isHost: boolean;
  onSettings: (patch: { rounds?: number; roundSeconds?: number }) => void;
  socket: AppSocket;
  act: Act;
}) {
  const { players, you, state } = room;
  const { rounds, roundSeconds, maxGuesses } = state.settings;

  return (
    <div className="wordrace-lobby">
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
        <p className="hint">
          You can race solo against the clock, or share the room code and add bots to fill the field.
        </p>
      </section>

      <GameSettings isHost={isHost} summary={`${rounds} rounds · ${Math.round(roundSeconds / 60)} min each`}>
        <NumberField
          label="Rounds"
          value={rounds}
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          suffix="rounds"
          disabled={!isHost}
          onCommit={(n) => onSettings({ rounds: n })}
        />
        <NumberField
          label="Time per round"
          value={Math.round(roundSeconds / 60)}
          min={Math.ceil(MIN_ROUND_SECONDS / 60)}
          max={Math.floor(MAX_ROUND_SECONDS / 60)}
          suffix="min"
          disabled={!isHost}
          onCommit={(min) => onSettings({ roundSeconds: min * 60 })}
        />

        <p className="muted small-text settings-row-full">
          Everyone gets the same word and {maxGuesses} guesses. Fewer guesses and a faster solve mean more points.
        </p>
      </GameSettings>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

function Playing({
  room,
  round,
  act,
  socket,
  onLocalToast,
}: {
  room: WordRaceRoomView;
  round: WordRaceRoundView;
  act: Act;
  socket: AppSocket;
  onLocalToast: (msg: string) => void;
}) {
  const { you, state, players } = room;
  const myBoard = round.boards[you.id];
  const inRound = round.participantIds.includes(you.id) && !!myBoard;
  const solving = inRound && myBoard.status === 'solving';
  const [current, setCurrent] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  // Clear the typed row whenever a new round starts.
  useEffect(() => setCurrent(''), [round.number]);

  const shakeRow = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  }, []);

  const submit = useCallback(async () => {
    if (!solving || busy) return;
    if (!/^[A-Z]{5}$/.test(current)) {
      onLocalToast('Type five letters first.');
      shakeRow();
      return;
    }
    if (myBoard.guesses.some((g) => g.word === current)) {
      onLocalToast('You already tried that word.');
      shakeRow();
      return;
    }
    setBusy(true);
    const ok = await act((ack) => socket.emit('wordrace:guess', { word: current }, ack));
    setBusy(false);
    if (ok) setCurrent('');
    else shakeRow();
  }, [solving, busy, current, myBoard, act, socket, onLocalToast, shakeRow]);

  const onKey = useCallback(
    (key: string) => {
      if (!solving) return;
      if (key === 'Enter') {
        void submit();
      } else if (key === 'Backspace') {
        setCurrent((c) => c.slice(0, -1));
      } else if (/^[A-Za-z]$/.test(key)) {
        setCurrent((c) => (c.length < 5 ? c + key.toUpperCase() : c));
      }
    },
    [solving, submit],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[A-Za-z]$/.test(e.key)) {
        e.preventDefault();
        onKey(e.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey]);

  const statuses = useMemo(() => letterStatuses(myBoard?.guesses ?? []), [myBoard]);
  const others = round.participantIds.filter((id) => id !== you.id);
  const solvedCount = round.participantIds.filter((id) => round.boards[id]?.status === 'solved').length;

  return (
    <div className="wordrace-grid">
      <section className="wordrace-main">
        <div className="card wordrace-clock">
          <Countdown endsAt={round.endsAt} serverNow={state.serverNow} />
          <span className="muted small-text">
            {solvedCount} of {round.participantIds.length} solved
          </span>
        </div>

        {inRound ? (
          <>
            <Board
              guesses={myBoard.guesses}
              maxGuesses={state.settings.maxGuesses}
              current={solving ? current : ''}
              shake={shake}
            />
            {myBoard.status === 'solved' && (
              <div className="banner blue">
                <strong>Solved!</strong>
                <span>
                  #{myBoard.finishOrder} to finish · +{myBoard.points} points. Waiting for the others…
                </span>
              </div>
            )}
            {myBoard.status === 'failed' && (
              <div className="banner red">
                <strong>Out of guesses</strong>
                <span>The word will be revealed when the round ends.</span>
              </div>
            )}
            <Keyboard statuses={statuses} onKey={onKey} disabled={!solving || busy} />
          </>
        ) : (
          <div className="card">
            <h3>Spectating</h3>
            <p className="muted">You joined mid-round. You&apos;ll be dealt in when the next round starts.</p>
          </div>
        )}
      </section>

      <aside className="wordrace-side">
        <section className="card">
          <h3>Racers</h3>
          {others.length === 0 && <p className="muted small-text">Just you against the clock.</p>}
          {others.map((id) => {
            const p = players.find((pl) => pl.id === id);
            const b = round.boards[id];
            if (!b) return null;
            return (
              <MiniBoard
                key={id}
                name={p?.name ?? 'someone'}
                isBot={!!p?.isBot}
                offline={!!p && !p.connected}
                board={b}
                score={state.scores[id] ?? 0}
                maxGuesses={state.settings.maxGuesses}
              />
            );
          })}
        </section>
        <section className="card">
          <h3>Scores</h3>
          <ScoreList players={players} scores={state.scores} youId={you.id} />
        </section>
      </aside>
    </div>
  );
}

function MiniBoard({
  name,
  isBot,
  offline,
  board,
  score,
  maxGuesses,
}: {
  name: string;
  isBot: boolean;
  offline: boolean;
  board: PlayerBoardView;
  score: number;
  maxGuesses: number;
}) {
  const squares: (string | null)[] = [];
  for (let r = 0; r < maxGuesses; r++) {
    const g = board.guesses[r];
    for (let c = 0; c < 5; c++) squares.push(g ? g.marks[c] : null);
  }
  return (
    <div className="wordrace-mini">
      <div className="wordrace-mini-head">
        <span className="player-name">{name}</span>
        {isBot && <span className="tag bot">bot</span>}
        {offline && <span className="tag">away</span>}
        <StatusBadge board={board} />
        <span className="score">{score}</span>
      </div>
      <div className="wordrace-squares" aria-label={`${name}'s board`}>
        {squares.map((m, i) => (
          <span key={i} className={`wordrace-square ${m ?? ''}`} />
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ board }: { board: PlayerBoardView }) {
  if (board.status === 'solved') return <span className="tag wordrace-solved">solved #{board.finishOrder}</span>;
  if (board.status === 'failed') return <span className="tag wordrace-failed">failed</span>;
  return (
    <span className="tag wordrace-solving">
      solving · {board.guesses.length}/6
    </span>
  );
}

function Countdown({ endsAt, serverNow }: { endsAt: number; serverNow: number }) {
  const now = useServerClock(serverNow, 250);
  const remaining = Math.max(0, endsAt - now);
  const total = secondsLeft(endsAt, now);
  const urgent = remaining > 0 && remaining < 30_000;
  return (
    <div className={`countdown ${urgent ? 'urgent' : ''} ${remaining === 0 ? 'done' : ''}`} aria-live="off">
      {remaining === 0 ? "TIME'S UP" : formatClock(total)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function Reveal({ room, round }: { room: WordRaceRoomView; round: WordRaceRoundView }) {
  const { you, state, players } = room;
  const ids = Object.keys(round.boards).sort((a, b) => rank(round.boards[a]) - rank(round.boards[b]));
  const isLast = state.roundsPlayed >= state.settings.rounds;

  return (
    <div className="wordrace-main" style={{ alignItems: 'stretch' }}>
      <div className="card wordrace-answer">
        <span className="muted small-text">The word was</span>
        <span className="word">{round.answer}</span>
        <span className="muted small-text">
          {round.endReason === 'timeUp' ? 'Time ran out.' : 'Everyone finished.'}{' '}
          {round.revealEndsAt !== null && (
            <RevealCountdown endsAt={round.revealEndsAt} serverNow={state.serverNow} isLast={isLast} />
          )}
        </span>
      </div>

      <div className="wordrace-reveal-boards">
        {ids.map((id) => {
          const p = players.find((pl) => pl.id === id);
          const b = round.boards[id];
          return (
            <div key={id} className={`wordrace-reveal-card ${id === you.id ? 'you' : ''}`}>
              <div className="wordrace-mini-head" style={{ width: '100%' }}>
                <span className="player-name">
                  {p?.name ?? 'someone'}
                  {id === you.id && <span className="muted"> (you)</span>}
                </span>
                {p?.isBot && <span className="tag bot">bot</span>}
                <StatusBadge board={b} />
              </div>
              <Board guesses={b.guesses} maxGuesses={state.settings.maxGuesses} compact />
              <span className={`points ${b.points === 0 ? 'zero' : ''}`}>
                {b.points > 0 ? `+${b.points}` : '+0'} pts
              </span>
            </div>
          );
        })}
      </div>

      <section className="card">
        <h3>Standings</h3>
        <ScoreList players={players} scores={state.scores} youId={you.id} />
      </section>
    </div>
  );
}

function rank(b: PlayerBoardView): number {
  if (b.status === 'solved') return b.finishOrder ?? 99;
  return 100 + (b.status === 'failed' ? 0 : 1);
}

function RevealCountdown({ endsAt, serverNow, isLast }: { endsAt: number; serverNow: number; isLast: boolean }) {
  const now = useServerClock(serverNow, 250);
  const s = secondsLeft(endsAt, now);
  return (
    <>
      {isLast ? 'Final results' : 'Next round'} in {s}s…
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ended                                                               */
/* ------------------------------------------------------------------ */

function Ended({ room, isHost, act, socket }: { room: WordRaceRoomView; isHost: boolean; act: Act; socket: AppSocket }) {
  const { players, state, you } = room;
  const finalRound = state.round;
  // Only mounted on the ended screen, so the celebration channel is always live here.
  const celebration = useCelebration(socket, true);

  // The ended view keeps only the final round, so the per-player detail
  // describes that round rather than the whole game.
  const entries: PodiumEntry[] = players
    .filter((p) => p.id in state.scores)
    .map((p) => {
      const board = finalRound?.boards[p.id];
      let detail: PodiumEntry['detail'];
      if (board?.status === 'solved') {
        const n = board.guesses.length;
        detail = <>last word in {n === 1 ? '1 guess' : `${n} guesses`}</>;
      } else if (board?.status === 'failed') {
        detail = <>missed the last word</>;
      }
      return {
        id: p.id,
        name: p.name,
        score: state.scores[p.id] ?? 0,
        isBot: p.isBot,
        isYou: p.id === you.id,
        detail,
      };
    });

  // Sniping the final word in one or two guesses is worth pointing at. Only the
  // final round survives into the ended view, so this is deliberately about that
  // word rather than the whole game.
  const extraAwards: Award[] = useMemo(() => {
    if (!finalRound) return [];
    const sniper = players
      .filter((p) => p.id in state.scores)
      .map((p) => ({ p, board: finalRound.boards[p.id] }))
      .filter(({ board }) => board?.status === 'solved' && board.guesses.length <= 2)
      .sort((a, b) => a.board!.guesses.length - b.board!.guesses.length)[0];
    if (!sniper) return [];
    const n = sniper.board!.guesses.length;
    return [
      {
        key: 'wordrace-sniper',
        title: n === 1 ? 'Absolute Sniper' : 'Two and Done',
        note:
          n === 1
            ? 'Got the last word first try. We are choosing to believe that was skill.'
            : 'Cracked the last word in two guesses. Show-off, but a likeable one.',
        playerId: sniper.p.id,
        emoji: n === 1 ? '🎯' : '🥈',
      },
    ];
  }, [finalRound, players, state.scores]);

  return (
    <div className="card">
      <Podium entries={entries} unit="pts" celebration={celebration} extraAwards={extraAwards}>
        {finalRound?.answer && (
          <p className="wordrace-status-line">
            {state.roundsPlayed} {state.roundsPlayed === 1 ? 'round' : 'rounds'} played · the last word was{' '}
            <strong>{finalRound.answer}</strong>
          </p>
        )}
        <div className="podium-actions">
          {isHost ? (
            <>
              <button
                className="btn primary big"
                onClick={() => act((ack) => socket.emit('wordrace:start', ack))}
              >
                Play again
              </button>
              <button className="btn ghost" onClick={() => act((ack) => socket.emit('wordrace:reset', ack))}>
                Back to lobby
              </button>
            </>
          ) : (
            <p className="muted small-text">Waiting for the host to play again…</p>
          )}
        </div>
      </Podium>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function ScoreList({ players, scores, youId }: { players: Players; scores: Record<string, number>; youId: string }) {
  const ranked = players.slice().sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  return (
    <ul className="score-list">
      {ranked.map((p) => (
        <li key={p.id}>
          <span>
            {p.name}
            {p.id === youId && <span className="muted"> (you)</span>}
          </span>
          <strong>{scores[p.id] ?? 0}</strong>
        </li>
      ))}
    </ul>
  );
}
