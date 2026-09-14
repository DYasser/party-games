import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MIN_PLAYERS, type OneWordRoomView } from '@shared/oneword/types';
import { getSavedName, saveName, type AppSocket } from '../../lib/socket';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import OneWordPlay from './OneWordPlay';
import './oneword.css';

export default function OneWordRoom() {
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
  const { room, game, status, error, closed, toast, act, socket } = useRoom<OneWordRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  if (game && game !== 'oneword') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/oneword" className="btn">
          Back to One Word
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/oneword" className="btn">
          Back to One Word
        </Link>
      </div>
    );
  }

  if (!room) return <div className="card center-card muted">Connecting to room {code}…</div>;

  const { you, state, players } = room;
  const isHost = room.hostId === you.id;
  const connected = players.filter((p) => p.connected);
  const canStart = connected.length >= MIN_PLAYERS;
  const inLobby = state.phase === 'lobby';
  const ended = state.phase === 'ended';
  const playing = !inLobby && !ended;
  const cardsDone = state.outcomes.filter((o) => o !== null).length;
  const cardNumber = Math.min(cardsDone + (state.card && state.card.outcome === null ? 1 : 0), state.deckSize);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const start = () => act((ack) => socket.emit('oneword:start', ack));

  return (
    <div className="room oneword">
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
          {playing && (
            <span className="turn-pill">
              Card {cardNumber} of {state.deckSize} · Score {state.score}
            </span>
          )}
          {ended && <span>Game over · {state.score} / {state.deckSize}</span>}
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
            </>
          )}
          {isHost && inLobby && (
            <button
              className="btn small primary"
              onClick={start}
              disabled={!canStart}
              title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players`}
            >
              Start
            </button>
          )}
          {isHost && state.phase === 'result' && (
            <button className="btn small primary" onClick={() => act((ack) => socket.emit('oneword:next', ack))}>
              Next card
            </button>
          )}
          {isHost && !inLobby && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  ended ||
                  (await ask('Abandon this deck and return to the lobby?', {
                    title: 'Abandon deck?',
                    confirmLabel: 'Abandon',
                  }))
                ) {
                  void act((ack) => socket.emit('oneword:reset', ack));
                }
              }}
            >
              {ended ? 'Lobby' : 'Reset'}
            </button>
          )}
          {!isHost && inLobby && <span className="muted small-text">Waiting for the host to start…</span>}
        </div>
      </div>

      {inLobby && <Lobby room={room} />}
      {playing && <OneWordPlay room={room} act={act} socket={socket} />}
      {ended && <Ended room={room} isHost={isHost} onAgain={start} canStart={canStart} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({ room }: { room: OneWordRoomView }) {
  const { players, you } = room;
  const online = players.filter((p) => p.connected).length;
  return (
    <div className="oneword-lobby">
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
        {online < MIN_PLAYERS && <p className="hint">You need at least {MIN_PLAYERS} players. Share the room code or add a bot!</p>}
      </section>

      <section className="card">
        <h3>How it works</h3>
        <p className="muted small-text">
          One shared deck of 13 secret words, one shared score. Each card, one of you guesses while everyone else writes a single
          one-word hint. Matching hints cancel out, so think of something the others won&apos;t.
        </p>
        <p className="muted small-text">
          A wrong guess costs two cards; passing costs one. Bots can hint and guess, so you can play with as few as one friend.
        </p>
      </section>
    </div>
  );
}

/** Counts up from zero to `target` once mounted, so the final score lands with a flourish. */
function useCountUp(target: number, delayMs: number, durationMs = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      // Ease out, so it decelerates into the final number.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, delayMs, durationMs]);

  return value;
}

/**
 * Cooperative finale. One shared score means a competitive podium makes no sense
 * here, so the room gets a single celebratory result card instead: the score
 * counts up, the rating is the headline, and the deck's outcome dots replay as a
 * per-card recap.
 */
function Ended({
  room,
  isHost,
  onAgain,
  canStart,
}: {
  room: OneWordRoomView;
  isHost: boolean;
  onAgain: () => void;
  canStart: boolean;
}) {
  const { state, players, you } = room;
  const perfect = state.score >= state.deckSize;

  const shown = useCountUp(state.score, 350);
  const wrong = state.outcomes.filter((o) => o === 'fail').length;
  const passed = state.outcomes.filter((o) => o === 'pass').length;
  const discarded = state.outcomes.filter((o) => o === 'discarded').length;

  return (
    <div className="oneword-ended">
      <div className={`card oneword-finale ${perfect ? 'perfect' : ''}`}>
        <span className="oneword-finale-label">Final score</span>

        <div className="oneword-finale-score" aria-label={`${state.score} out of ${state.deckSize}`}>
          <strong className="oneword-finale-number">{shown}</strong>
          <span className="oneword-finale-outof">/ {state.deckSize}</span>
        </div>

        {state.rating && <p className="oneword-finale-rating">{state.rating}</p>}

        <div className="oneword-finale-recap">
          <span className="oneword-finale-recap-label">Card by card</span>
          <DeckDots outcomes={state.outcomes} current={-1} animated />
        </div>

        <ul className="oneword-finale-tallies">
          <li>
            <strong>{state.score}</strong> <span className="muted">correct</span>
          </li>
          <li>
            <strong>{wrong}</strong> <span className="muted">wrong</span>
          </li>
          <li>
            <strong>{passed}</strong> <span className="muted">passed</span>
          </li>
          <li>
            <strong>{discarded}</strong> <span className="muted">discarded</span>
          </li>
        </ul>

        <div className="oneword-finale-actions">
          {isHost ? (
            <button className="btn primary big" onClick={onAgain} disabled={!canStart}>
              Play again
            </button>
          ) : (
            <p className="muted small-text">Waiting for the host to start another deck…</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 13 dots: green success, red fail, grey discarded/passed, hollow remaining.
 * With `animated`, they pop in one after another as an end-of-game recap.
 */
export function DeckDots({
  outcomes,
  current,
  animated = false,
}: {
  outcomes: OneWordRoomView['state']['outcomes'];
  current: number;
  animated?: boolean;
}) {
  return (
    <div className={`oneword-dots ${animated ? 'animated' : ''}`} aria-label="Deck progress">
      {outcomes.map((o, i) => (
        <span
          key={i}
          className={`oneword-dot ${o ?? 'remaining'} ${i === current ? 'current' : ''}`}
          style={animated ? { animationDelay: `${450 + i * 70}ms` } : undefined}
          title={`Card ${i + 1}: ${o ?? 'to come'}`}
        />
      ))}
    </div>
  );
}
