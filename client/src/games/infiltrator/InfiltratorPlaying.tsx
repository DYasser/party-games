import { useState } from 'react';
import type { InfiltratorRoomView } from '@shared/infiltrator/types';
import type { AppSocket } from '../../lib/socket';
import { useConfirm } from '../../lib/useConfirm';
import { formatClock, useServerClock } from '../../lib/useServerClock';
import type { Act } from '../../lib/useRoom';

interface Props {
  room: InfiltratorRoomView;
  act: Act;
  socket: AppSocket;
}

export default function InfiltratorPlaying({ room, act, socket }: Props) {
  const { state, you, players } = room;
  const round = state.round!;
  const voting = state.phase === 'voting';
  const inRound = round.participantIds.includes(you.id);
  const participants = round.participantIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const accusation = round.accusation;
  const canAccuse = inRound && !voting && !accusation && !round.accusedBy.includes(you.id);
  const [guessing, setGuessing] = useState(false);
  const [struck, setStruck] = useState<Set<string>>(() => new Set());
  const { ask, dialog } = useConfirm();

  const toggleStrike = (loc: string) =>
    setStruck((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });

  const myFinalVote = round.finalVotes[you.id];
  const votesCast = Object.keys(round.finalVotes).length;

  return (
    <div className="spy-grid">
      {dialog}
      <section className="spy-main">
        <RoleCard round={round} inRound={inRound} />

        <div className="spy-clock card">
          <Countdown endsAt={round.endsAt} pausedAt={round.pausedAt} serverNow={state.serverNow} timeUp={voting} />
          {round.pausedAt !== null && !voting && <span className="muted small-text">Clock paused for the vote</span>}
        </div>

        {voting && (
          <div className="card vote-box">
            <h3>Time&apos;s up! Who is the spy?</h3>
            <p className="muted small-text">
              {votesCast} of {participants.length} votes in.
              {myFinalVote && ` You voted for ${nameOf(players, myFinalVote)}.`}
            </p>
            {inRound && (
              <div className="vote-buttons">
                {participants
                  .filter((p) => p.id !== you.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      className={`btn ${myFinalVote === p.id ? 'primary' : ''}`}
                      onClick={() => act((ack) => socket.emit('infiltrator:finalVote', { playerId: p.id }, ack))}
                    >
                      {p.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        <section className="card">
          <div className="section-head">
            <h3>Locations</h3>
            {round.isSpy && inRound && !accusation && (
              <button className={`btn small ${guessing ? '' : 'primary'}`} onClick={() => setGuessing((g) => !g)}>
                {guessing ? 'Cancel guess' : 'Guess the location'}
              </button>
            )}
          </div>
          {guessing && <p className="hint">Tap a location to guess it. This ends the round immediately!</p>}
          {!guessing && <p className="muted small-text">Tap a location to cross it off your list. Only you see this.</p>}
          <div className="location-grid">
            {state.locations.map((loc) => (
              <button
                key={loc}
                className={`location-chip ${struck.has(loc) ? 'struck' : ''} ${guessing ? 'guessing' : ''} ${
                  round.location === loc ? 'current' : ''
                }`}
                onClick={async () => {
                  if (guessing) {
                    if (
                      await ask(`Guess "${loc}"? If you are wrong, the agents win.`, {
                        title: 'Name the location?',
                        confirmLabel: 'Guess',
                        danger: false,
                      })
                    ) {
                      void act((ack) => socket.emit('infiltrator:guess', { location: loc }, ack));
                      setGuessing(false);
                    }
                  } else {
                    toggleStrike(loc);
                  }
                }}
              >
                {loc}
              </button>
            ))}
          </div>
        </section>
      </section>

      <aside className="spy-side">
        <section className="card">
          <h3>Players</h3>
          <ul className="player-list">
            {participants.map((p) => (
              <li key={p.id} className={`player-row ${p.connected ? '' : 'offline'}`}>
                <span className="player-name">
                  {p.name}
                  {p.id === you.id && <span className="muted"> (you)</span>}
                </span>
                {p.isBot && <span className="tag bot">bot</span>}
                {round.accusedBy.includes(p.id) && <span className="tag" title="Has used their accusation">accused</span>}
                {!p.connected && <span className="tag">away</span>}
                {canAccuse && p.id !== you.id && (
                  <button
                    className="btn small"
                    onClick={async () => {
                      if (
                        await ask(`Accuse ${p.name} of being the spy? You only get one accusation per round.`, {
                          title: 'Accuse a player?',
                          confirmLabel: 'Accuse',
                          danger: false,
                        })
                      ) {
                        void act((ack) => socket.emit('infiltrator:accuse', { accusedId: p.id }, ack));
                      }
                    }}
                  >
                    Accuse
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!inRound && <p className="muted small-text">You joined mid-round. You&apos;ll be dealt in next round.</p>}
          {inRound && !voting && round.accusedBy.includes(you.id) && (
            <p className="muted small-text">You have used your accusation this round.</p>
          )}
        </section>

        {Object.keys(state.scores).length > 0 && (
          <section className="card">
            <h3>Scores</h3>
            <ul className="score-list">
              {players
                .slice()
                .sort((a, b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0))
                .map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <strong>{state.scores[p.id] ?? 0}</strong>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </aside>

      {accusation && (
        <div className="overlay">
          <div className="card accusation">
            <h3>
              {nameOf(players, accusation.accuserId)} accuses {nameOf(players, accusation.accusedId)}
            </h3>
            <p className="muted">Everyone except the accused must agree to convict.</p>
            <ul className="vote-status">
              {participants
                .filter((p) => p.id !== accusation.accusedId)
                .map((p) => (
                  <li key={p.id} className={accusation.votes[p.id] ? 'yes' : ''}>
                    {p.name}
                    {accusation.votes[p.id] ? ' ✓' : ' …'}
                  </li>
                ))}
            </ul>
            {you.id === accusation.accusedId && <p className="hint">You have been accused! Defend yourself.</p>}
            {inRound && you.id !== accusation.accusedId && !(you.id in accusation.votes) && (
              <div className="vote-buttons">
                <button className="btn primary" onClick={() => act((ack) => socket.emit('infiltrator:vote', { agree: true }, ack))}>
                  Agree, they&apos;re the spy
                </button>
                <button className="btn" onClick={() => act((ack) => socket.emit('infiltrator:vote', { agree: false }, ack))}>
                  Disagree
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleCard({ round, inRound }: { round: NonNullable<InfiltratorRoomView['state']['round']>; inRound: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (!inRound) {
    return (
      <div className="role-card spectator">
        <span className="role-label">Spectating</span>
        <strong>Round in progress</strong>
      </div>
    );
  }
  return (
    <button className={`role-card ${round.isSpy ? 'spy' : 'agent'} ${hidden ? 'hidden' : ''}`} onClick={() => setHidden((h) => !h)}>
      {hidden ? (
        <>
          <span className="role-label">Tap to reveal</span>
          <strong>Your card is hidden</strong>
        </>
      ) : round.isSpy ? (
        <>
          <span className="role-label">You are the</span>
          <strong>SPY</strong>
          <span className="role-sub">Figure out the location without getting caught.</span>
        </>
      ) : (
        <>
          <span className="role-label">Location</span>
          <strong>{round.location}</strong>
          <span className="role-sub">Your role: {round.role}</span>
        </>
      )}
      <span className="role-hint">tap to {hidden ? 'show' : 'hide'}</span>
    </button>
  );
}

function Countdown({
  endsAt,
  pausedAt,
  serverNow,
  timeUp,
}: {
  endsAt: number;
  pausedAt: number | null;
  serverNow: number;
  timeUp: boolean;
}) {
  // Smoothly ticking server time; while paused we freeze on the server's mark.
  const clock = useServerClock(serverNow, 250);
  const now = pausedAt ?? clock;
  const remaining = timeUp ? 0 : Math.max(0, endsAt - now);
  const total = Math.ceil(remaining / 1000);
  const urgent = !timeUp && remaining > 0 && remaining < 60_000;

  return (
    <div className={`countdown ${urgent ? 'urgent' : ''} ${timeUp ? 'done' : ''}`} aria-live="off">
      {timeUp ? "TIME'S UP" : formatClock(total)}
    </div>
  );
}

function nameOf(players: InfiltratorRoomView['players'], id: string): string {
  return players.find((p) => p.id === id)?.name ?? 'someone';
}
