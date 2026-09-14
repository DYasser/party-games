import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { CipherGridSettings, Role, RoomView, Team } from '@shared/ciphergrid/types';
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, TIMER_OFF } from '@shared/ciphergrid/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import { getSavedName, saveName, type AppSocket } from '../../lib/socket';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import Board from './Board';
import TeamPanel from './TeamPanel';
import GameLog from './GameLog';
import ClueBar from './ClueBar';
import { formatClock, secondsLeft, useServerClock } from '../../lib/useServerClock';
import './ciphergrid.css';
import GameOverReveal from './GameOverReveal';
import TeamPodium from './TeamPodium';
import SpectatorBench from './SpectatorBench';
import { SeatDragProvider, seatKey } from './useSeatDrag';
import './gameover.css';

export default function CipherGridRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<RoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  /*
   * The end-of-game cinematic plays once per finished game, and re-arms when a
   * new one starts.
   *
   * These hooks MUST stay above the early returns below. React identifies a
   * hook by its call order, so a hook placed after a conditional `return` is
   * skipped on the renders that bail out early and runs on the ones that do
   * not — which crashes with "Rendered more hooks than during the previous
   * render" as soon as the room finishes connecting.
   */
  const [revealSeen, setRevealSeen] = useState(false);
  const [boardShown, setBoardShown] = useState(true);
  const phase = room?.state.phase;
  useEffect(() => {
    if (phase && phase !== 'ended') setRevealSeen(false);
    // A new game always starts with the board on screen.
    if (phase && phase !== 'ended') setBoardShown(true);
  }, [phase]);

  if (game && game !== 'ciphergrid') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/ciphergrid" className="btn">
          Back to Cipher Grid
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/ciphergrid" className="btn">
          Back to Cipher Grid
        </Link>
      </div>
    );
  }

  if (!room) {
    return <div className="card center-card muted">Connecting to room {code}…</div>;
  }

  const { you, state, players } = room;
  const isHost = room.hostId === you.id;
  const inLobby = state.phase === 'lobby';

  const lastEntry = state.log.at(-1);
  const endedByTrap =
    lastEntry?.kind === 'win' && (lastEntry as { reason?: string }).reason === 'assassin';
  // The trap card is public once the game is over.
  const trapWord = state.cards.find((c) => c.type === 'assassin')?.word;
  const showReveal = !revealSeen;
  const myTurn = state.phase === 'playing' && you.team === state.turn;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const joinTeam = (team: 'red' | 'blue', role: 'spymaster' | 'operative') =>
    act((ack) => socket.emit('team:join', { team, role }, ack));

  const onSettings = (patch: Partial<CipherGridSettings>) =>
    act((ack) => socket.emit('game:settings', patch, ack));

  /** Host-only: seat any player, or send them to the bench with nulls. */
  const assignSeat = (playerId: string, team: Team | null, role: Role | null) =>
    act((ack) => socket.emit('team:assign', { playerId, team, role }, ack));

  return (
    <div className="room">
      {dialog}
      <div className="room-bar">
        <div className="room-code">
          <span className="muted">Room</span> <strong>{room.code}</strong>
          <button className="btn small ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
        <div className="room-status">
          <StatusLine state={state} you={you} />
        </div>
        <div className="room-actions">
          {isHost && inLobby && (
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
                className="btn small ghost"
                onClick={() => act((ack) => socket.emit('team:randomize', ack))}
                disabled={players.length < 4}
                title={players.length < 4 ? 'Need at least 4 players' : 'Shuffle everyone into teams'}
              >
                Shuffle teams
              </button>
              <button className="btn small primary" onClick={() => act((ack) => socket.emit('game:start', ack))}>
                Start game
              </button>
            </>
          )}
          {isHost && !inLobby && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  state.phase === 'ended' ||
                  (await ask('End the current game and return to the lobby?', {
                    title: 'End game?',
                    confirmLabel: 'End game',
                  }))
                ) {
                  void act((ack) => socket.emit('game:reset', ack));
                }
              }}
            >
              {state.phase === 'ended' ? 'New game' : 'Reset game'}
            </button>
          )}
          {!isHost && inLobby && <span className="muted small-text">Waiting for the host to start…</span>}
        </div>
      </div>

      <SeatDragProvider
        isHost={isHost}
        youId={you.id}
        enabled={inLobby}
        seatOf={(id) => {
          const p = players.find((pl) => pl.id === id);
          return p ? seatKey(p) : 'spectators';
        }}
        onAssign={assignSeat}
      >
      <div className="room-grid">
        <TeamPanel team="red" room={room} onJoin={joinTeam} />

        <section className="board-area">
          {inLobby ? (
            <LobbyCenter room={room} isHost={isHost} onSettings={onSettings} />
          ) : (
            <>
              <ClueBar room={room} act={act} socket={socket} />

              {/*
               * The board only folds away once the game is over. While playing
               * it is the game, so there is nothing to toggle.
               */}
              {state.phase === 'ended' && (
                <div className="cg-board-toggle">
                  <button className="btn small" onClick={() => setBoardShown((v) => !v)} aria-expanded={boardShown}>
                    {boardShown ? 'Hide the grid' : 'Show the grid'}
                  </button>
                </div>
              )}

              {(state.phase !== 'ended' || boardShown) && (
                <Board
                  cards={state.cards}
                  canGuess={myTurn && you.role === 'operative' && state.currentClue !== null}
                  isSpymaster={you.role === 'spymaster'}
                  ended={state.phase === 'ended'}
                  onGuess={(index) => act((ack) => socket.emit('game:guess', { index }, ack))}
                />
              )}

              {state.phase === 'ended' && state.winner && (
                <>
                  <div className={`banner cg-win ${state.winner}`} role="status">
                    <strong>{cap(state.winner)} team wins!</strong>{' '}
                    {endedByTrap ? 'The other team hit the trap.' : 'All agents contacted.'}
                  </div>
                  <TeamPodium room={room} winner={state.winner} byTrap={endedByTrap} />
                </>
              )}
            </>
          )}
        </section>

        <div className="room-side">
          <TeamPanel team="blue" room={room} onJoin={joinTeam} />
          {!inLobby && <GameLog log={state.log} />}
        </div>
      </div>
      </SeatDragProvider>

      {state.phase === 'ended' && state.winner && showReveal && (
        <GameOverReveal
          winner={state.winner}
          byTrap={endedByTrap}
          word={trapWord}
          winners={players.filter((p) => p.team === state.winner).map((p) => p.name)}
          onDone={() => setRevealSeen(true)}
        />
      )}


      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}




function LobbyCenter({
  room,
  isHost,
  onSettings,
}: {
  room: RoomView;
  isHost: boolean;
  onSettings: (patch: Partial<CipherGridSettings>) => void;
}) {
  const { you, state } = room;
  return (
    <div className="lobby-center">
      <h2>Waiting room</h2>
      <p className="muted">
        Share the room code <strong>{room.code}</strong> with your friends, then drag everyone into a seat.
        Each team needs one spymaster and at least one operative.
      </p>
      {!you.team && <p className="hint">You are spectating. Drag yourself onto a team to play.</p>}

      <SpectatorBench room={room} />

      <div className="cg-lobby-settings">
        <GameSettings isHost={isHost} summary={timerSummary(state.settings)}>
          <NumberField
            label="Clue time"
            value={state.settings.clueSeconds}
            /* 0 switches the timer off and is shown as ∞; the server rejects 1–14. */
            min={TIMER_OFF}
            max={MAX_TIMER_SECONDS}
            step={15}
            suffix="sec"
            infinityAt={TIMER_OFF}
            hint={`∞ for no limit, or ${MIN_TIMER_SECONDS}–${MAX_TIMER_SECONDS}`}
            disabled={!isHost}
            onCommit={(v) => onSettings({ clueSeconds: v })}
          />
          <NumberField
            label="Guess time"
            value={state.settings.guessSeconds}
            min={TIMER_OFF}
            max={MAX_TIMER_SECONDS}
            step={15}
            suffix="sec"
            infinityAt={TIMER_OFF}
            hint={`∞ for no limit, or ${MIN_TIMER_SECONDS}–${MAX_TIMER_SECONDS}`}
            disabled={!isHost}
            onCommit={(v) => onSettings({ guessSeconds: v })}
          />
          <p className="settings-row-full cg-settings-note">
            Timers are off (∞) by default. A spymaster who runs out of clue time forfeits the turn; operatives
            who run out stop guessing. Anything between 1 and {MIN_TIMER_SECONDS - 1} seconds is too short to
            play, so drop to ∞ to turn a timer off.
          </p>
        </GameSettings>
      </div>
    </div>
  );
}

function StatusLine({ state, you }: { state: RoomView['state']; you: { team: 'red' | 'blue' | null; role: string | null } }) {
  // Pin the clock offset once, so the countdown ticks smoothly instead of
  // jumping whenever a broadcast arrives. Hooks run before any early return.
  const now = useServerClock(state.serverNow);

  if (state.phase === 'lobby') return <span className="muted">Lobby</span>;
  if (state.phase === 'ended') return <span>Game over</span>;
  const mine = you.team === state.turn;
  const who = mine ? 'Your' : `${cap(state.turn)} team's`;
  let detail: string;
  if (!state.currentClue) {
    detail = mine && you.role === 'spymaster' ? 'Give a clue!' : 'waiting for a clue';
  } else if (mine && you.role === 'operative') {
    detail = 'Make your guesses';
  } else {
    detail = 'operatives are guessing';
  }
  // Timers are optional, so there is only a clock when the host turned one on.
  const left = state.turnEndsAt === null ? null : secondsLeft(state.turnEndsAt, now);

  return (
    <span className={`turn-pill ${state.turn}`}>
      {who} turn · {detail}
      {left !== null && (
        <span className={`turn-clock ${left <= 10 ? 'urgent' : ''}`} aria-label={`${left} seconds left`}>
          {formatClock(left)}
        </span>
      )}
    </span>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One line for the settings button. Both timers default to off, so the common
 * case has to read as a deliberate choice rather than as missing values — and
 * the two half-on cases have to say *which* timer is running.
 */
function timerSummary({ clueSeconds, guessSeconds }: CipherGridSettings) {
  const clueOff = clueSeconds === TIMER_OFF;
  const guessOff = guessSeconds === TIMER_OFF;
  if (clueOff && guessOff) return 'No timers · play at your own pace';
  if (clueOff) return `No clue timer · ${guessSeconds}s to guess`;
  if (guessOff) return `${clueSeconds}s to clue · no guess timer`;
  return `${clueSeconds}s to clue · ${guessSeconds}s to guess`;
}
