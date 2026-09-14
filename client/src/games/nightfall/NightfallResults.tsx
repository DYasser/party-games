import { useState } from 'react';
import type { ReactionKey } from '@shared/celebration';
import { ROLE_INFO, TEAM_NAME, type NightfallRoomView } from '@shared/nightfall/types';
import { ConfettiCannon, FlyingReactions, ReactionPicker, ReactionTally } from '../../lib/CelebrationLayer';
import PlayerCard from './PlayerCard';
import type { AppSocket } from '../../lib/socket';
import { useCelebration } from '../../lib/useCelebration';
import { EventLog, RoleTag, nameOf } from './NightfallPlay';

export default function NightfallResults({ room, socket }: { room: NightfallRoomView; socket: AppSocket }) {
  const { state, players, you } = room;
  const winner = state.winner ?? 'town';
  const myRole = state.you.role;
  const myTeam = myRole ? ROLE_INFO[myRole].team : null;
  const youWon = myTeam !== null && myTeam === winner;
  const celebration = useCelebration(socket, true);

  // Tapping a card opens its reaction tray; null means none is open.
  const [reactingTo, setReactingTo] = useState<string | null>(null);

  return (
    <div className="nightfall-results">
      <div className={`banner ${winner === 'shades' ? 'red' : 'blue'}`}>
        <strong>{winner === 'shades' ? 'The Shades win!' : 'The Town wins!'}</strong>
        <span>
          {winner === 'shades'
            ? 'The Shades outnumbered what was left of the town.'
            : 'Every Shade has been rooted out.'}
        </span>
        {myTeam && (
          <span className="you-result">
            You were {myRole === 'oracle' || myRole === 'healer' ? 'the' : 'a'} {ROLE_INFO[myRole!].name} for {TEAM_NAME[myTeam]}.{' '}
            {youWon ? 'You won!' : 'You lost.'}
          </span>
        )}
      </div>

      <div className="nightfall-grid">
        <section className="nightfall-main">
          <section className="card">
            <h3>Everyone&apos;s role</h3>
            <div className="nf-card-grid nf-reveal-grid">
              {state.participantIds.map((id, i) => {
                const role = state.revealedRoles[id];
                const player = players.find((p) => p.id === id);
                // Winners cheer, losers slump. Team is known now, so this is honest.
                const onWinningTeam = role ? ROLE_INFO[role].team === winner : false;
                return (
                  <div key={id} className="nf-reveal-slot">
                  <PlayerCard
                    name={nameOf(players, id)}
                    role={role ?? null}
                    alive={!!state.alive[id]}
                    left={state.left.includes(id)}
                    isYou={id === you.id}
                    isBot={player?.isBot}
                    outcome={onWinningTeam ? 'win' : 'lose'}
                    delayMs={i * 130}
                    note={state.alive[id] ? 'survived' : state.left.includes(id) ? 'left' : 'eliminated'}
                    onClick={() => setReactingTo((cur) => (cur === id ? null : id))}
                    celebrateAnchor={id}
                  />
                  <ReactionTally counts={celebration.tally[id]} />
                  {reactingTo === id && (
                    <ReactionPicker
                      targetName={nameOf(players, id)}
                      onPick={(which: ReactionKey) => celebration.react(id, which)}
                      onClose={() => setReactingTo(null)}
                    />
                  )}
                  </div>
                );
              })}
            </div>
            {you.id !== room.hostId && <p className="muted small-text">Waiting for the host to start another game…</p>}
          </section>
        </section>
        <aside className="nightfall-side">
          <EventLog room={room} />
        </aside>
      </div>

      {/*
        No separate reactions panel: the role cards above already list everyone,
        so a second copy of the same names was pure duplication. Reactions live
        on the cards themselves, and this is just the shared confetti button.
      */}
      <div className="nf-results-actions">
        <ConfettiCannon celebration={celebration} />
      </div>

      <FlyingReactions flying={celebration.flying} />
    </div>
  );
}
