import { useEffect, useMemo, useState } from 'react';
import { countMatching, minFace, minimumRaise, raiseProblem } from '@shared/bluffdice/logic';
import type { BluffDiceRoomView } from '@shared/bluffdice/types';
import type { AppSocket } from '../../lib/socket';
import { secondsLeft, useServerClock } from '../../lib/useServerClock';
import type { Act } from '../../lib/useRoom';
import Die from './Die';

interface Props {
  room: BluffDiceRoomView;
  act: Act;
  socket: AppSocket;
}

export default function BluffDiceTable({ room, act, socket }: Props) {
  const { state, you, players } = room;
  const { onesWild } = state.settings;
  const reveal = state.phase === 'reveal';
  const me = state.players[you.id];
  const myDice = me?.dice ?? [];
  const spectating = !me || me.diceCount === 0;
  const isMyTurn = state.phase === 'bidding' && state.currentPlayerId === you.id;
  const isHost = room.hostId === you.id;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'someone';
  const result = state.lastResult;
  const revealFace = reveal && result ? result.bid.face : null;

  const isHit = (d: number) => revealFace !== null && (d === revealFace || (onesWild && revealFace !== 1 && d === 1));

  return (
    <div className="bluffdice-table">
      <div className="bluffdice-seats">
        {state.seatOrder.map((id) => {
          const p = state.players[id];
          const player = players.find((pl) => pl.id === id);
          const out = p.diceCount === 0;
          const current = state.currentPlayerId === id;
          const lostDie = reveal && result?.loserId === id;
          const classes = ['bluffdice-seat', current ? 'current' : '', out ? 'out' : '', id === you.id ? 'you' : '', lostDie ? 'loser' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <div key={id} className={classes}>
              <div className="bluffdice-seat-head">
                <span className="bluffdice-seat-name">
                  {player?.name ?? 'left'}
                  {id === you.id && <span className="muted"> (you)</span>}
                </span>
                <span className="bluffdice-seat-tags">
                  {player?.isBot && <span className="tag bot">bot</span>}
                  {player && !player.connected && <span className="tag">away</span>}
                </span>
              </div>
              <div className="bluffdice-seat-dice">
                {p.dice
                  ? p.dice.map((d, i) => <Die key={i} face={d} size="sm" wild={onesWild && d === 1} hit={isHit(d)} />)
                  : Array.from({ length: p.diceCount }, (_, i) => <Die key={i} face={1} size="sm" hidden />)}
              </div>
              <span className="bluffdice-seat-state">
                {p.left ? 'left' : out ? 'out' : lostDie ? 'lost a die' : current ? 'bidding…' : `${p.diceCount} dice`}
              </span>
            </div>
          );
        })}
      </div>

      <section className="card bluffdice-center">
        {reveal && result ? (
          <RevealSummary room={room} />
        ) : state.bid ? (
          <>
            <div className="bluffdice-bid-chip">
              <span>{state.bid.quantity}</span>
              <span className="times">×</span>
              <Die face={state.bid.face} size="md" />
            </div>
            <span className="bluffdice-bid-by">bid by {nameOf(state.bid.bidderId)}</span>
          </>
        ) : (
          <div className="bluffdice-bid-chip empty">No bid yet</div>
        )}
        <div className="bluffdice-meta">
          <span>Round {state.round}</span>
          <span>{state.totalDice} dice on the table</span>
          <span>{onesWild ? 'Ones are wild' : 'Ones are plain'}</span>
        </div>
        {reveal && (
          <div className="bluffdice-waiting" style={{ width: '100%', justifyContent: 'center' }}>
            <RevealCountdown endsAt={state.revealEndsAt} serverNow={state.serverNow} />
            {isHost && (
              <button className="btn small primary" onClick={() => act((ack) => socket.emit('bluffdice:next', ack))}>
                Next
              </button>
            )}
          </div>
        )}
      </section>

      {!spectating && (
        <section className="card bluffdice-hand">
          <span className="bluffdice-hand-label">Your dice</span>
          <div className="bluffdice-hand-dice">
            {myDice.map((d, i) => (
              <Die key={i} face={d} size="lg" wild={onesWild && d === 1} hit={isHit(d)} />
            ))}
          </div>
        </section>
      )}

      {spectating && !reveal && (
        <section className="card bluffdice-waiting">
          <span className="muted">You are out of dice. Sit back and watch everyone else lie.</span>
        </section>
      )}

      {state.phase === 'bidding' && !spectating && (
        <section className="card">
          {isMyTurn ? (
            <TurnPanel room={room} act={act} socket={socket} />
          ) : (
            <div className="bluffdice-waiting">
              <span className="turn-pill blue">Waiting for {nameOf(state.currentPlayerId ?? '')}…</span>
              <TurnCountdown endsAt={state.turnEndsAt} serverNow={state.serverNow} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TurnPanel({ room, act, socket }: Props) {
  const { state } = room;
  const total = state.totalDice;
  const low = minFace(state.settings);
  const min = useMemo(() => minimumRaise(state.bid, state.settings, total), [state.bid, state.settings, total]);
  const [quantity, setQuantity] = useState(min?.quantity ?? 1);
  const [face, setFace] = useState(min?.face ?? low);
  const [busy, setBusy] = useState(false);

  // Re-seed the picker whenever the bid on the table changes.
  useEffect(() => {
    setQuantity(min?.quantity ?? 1);
    setFace(min?.face ?? low);
  }, [min, low]);

  const problem = raiseProblem(state.bid, quantity, face, state.settings, total);

  const send = async (emit: Parameters<Act>[0]) => {
    setBusy(true);
    await act(emit);
    setBusy(false);
  };

  return (
    <div className="bluffdice-turn">
      <div>
        <div className="bluffdice-clock">
          <span className="turn-pill spy">Your turn</span>
          <TurnCountdown endsAt={state.turnEndsAt} serverNow={state.serverNow} />
        </div>
        <div className="bluffdice-controls" style={{ marginTop: '0.75rem' }}>
          <div className="bluffdice-stepper" aria-label="Quantity">
            <button className="btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
              −
            </button>
            <output>{quantity}</output>
            <button className="btn" onClick={() => setQuantity((q) => Math.min(total, q + 1))} disabled={quantity >= total}>
              +
            </button>
          </div>
          <span className="muted">×</span>
          <div className="bluffdice-faces" role="radiogroup" aria-label="Face">
            {[1, 2, 3, 4, 5, 6].map((f) => (
              <button
                key={f}
                className={`bluffdice-face-btn ${face === f ? 'selected' : ''}`}
                onClick={() => setFace(f)}
                disabled={f < low}
                role="radio"
                aria-checked={face === f}
                title={f < low ? 'Ones are wild and cannot be bid on' : `${f}s`}
              >
                <Die face={f} size="md" className="pickable" />
              </button>
            ))}
          </div>
        </div>
        <p className="bluffdice-reason">{problem ?? ''}</p>
      </div>
      <div className="bluffdice-actions">
        <button
          className="btn primary big"
          disabled={busy || problem !== null}
          title={problem ?? ''}
          onClick={() => send((ack) => socket.emit('bluffdice:bid', { quantity, face }, ack))}
        >
          Bid {quantity} × {face}
        </button>
        <button
          className="btn bluffdice-liar"
          disabled={busy || !state.bid}
          title={state.bid ? 'Call the last bid a lie' : 'Nothing to challenge yet'}
          onClick={() => send((ack) => socket.emit('bluffdice:challenge', ack))}
        >
          Liar!
        </button>
      </div>
    </div>
  );
}

function RevealSummary({ room }: { room: BluffDiceRoomView }) {
  const { state, players } = room;
  const result = state.lastResult!;
  const { onesWild } = state.settings;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'someone';
  const bidder = nameOf(result.bid.bidderId);
  const challenger = nameOf(result.challengerId);

  // Sanity: recompute from the revealed dice so what the player sees adds up.
  const shown = Object.values(state.players).reduce((n, p) => n + countMatching(p.dice ?? [], result.bid.face, onesWild), 0);
  const actual = result.actual ?? shown;

  return (
    <div className="bluffdice-summary">
      <span>
        Bid: <strong>{result.bid.quantity}</strong> ×
        <Die face={result.bid.face} size="sm" className="bluffdice-inline-die" />
        <span className="muted"> ({bidder})</span> — Actual: <strong>{actual}</strong>
      </span>
      <span className={`verdict ${result.bidStood ? 'stood' : 'bluff'}`}>
        {result.bidStood ? `${challenger} called it wrong!` : `${bidder} was bluffing!`}
      </span>
      <span>
        {result.loserId
          ? `${nameOf(result.loserId)} loses a die${result.eliminatedId ? ' and is out of the game' : ''}.`
          : `${bidder} already left, so nobody loses a die.`}
      </span>
    </div>
  );
}

function TurnCountdown({ endsAt, serverNow }: { endsAt: number | null; serverNow: number }) {
  const now = useServerClock(serverNow, 250);
  if (endsAt === null) return null;
  const secs = secondsLeft(endsAt, now);
  return (
    <span className={`countdown ${secs <= 10 ? 'urgent' : ''}`} style={{ fontSize: '1.6rem' }} aria-live="off">
      {secs}s
    </span>
  );
}

function RevealCountdown({ endsAt, serverNow }: { endsAt: number | null; serverNow: number }) {
  const now = useServerClock(serverNow, 250);
  if (endsAt === null) return null;
  const secs = secondsLeft(endsAt, now);
  return <span className="muted small-text">Next round in {secs}s</span>;
}
