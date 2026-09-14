import type { RoomView, Team } from '@shared/ciphergrid/types';

interface Props {
  room: RoomView;
  winner: Team;
  /** True when the game ended because somebody hit the trap card. */
  byTrap: boolean;
}

/**
 * The result, as a two-step podium.
 *
 * Cipher Grid is played by teams, not by individuals: everyone on a side wins
 * or loses together and nobody carries a personal score. So this ranks the two
 * teams rather than the players, and lists each team's line-up on its block —
 * a per-player podium would have to invent an order that the game never
 * produced.
 *
 * The score shown is agents still to find, which is the one number the game
 * actually tracks. The winner is always at zero, unless they won because the
 * other team hit the trap, in which case the count is left out entirely rather
 * than shown as a total nobody earned.
 */
export default function TeamPodium({ room, winner, byTrap }: Props) {
  const loser: Team = winner === 'red' ? 'blue' : 'red';
  const order: Team[] = [winner, loser];

  return (
    <div className="cg-podium-wrap">
      <div className="cg-podium" role="group" aria-label="Final standings">
        {/* Sparks burst from behind the winner's column as it lands. */}
        <div className="cg-pod-sparks" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>

        {order.map((team, i) => {
          const members = room.players.filter((p) => p.team === team);
          const won = team === winner;
          const left = room.state.remaining[team];
          return (
            <div
              key={team}
              className={`cg-pod ${team} ${won ? 'winner' : 'loser'}`}
              /* Staggered so the winner lands first and the loser follows. */
              style={{ animationDelay: `${i * 180}ms` }}
            >
              {won && (
                <div className="cg-pod-crown" aria-hidden>
                  👑
                </div>
              )}

              <div className="cg-pod-medal" aria-hidden>
                {won ? '🥇' : '🥈'}
              </div>

              <div className="cg-pod-rank">{won ? '1st' : '2nd'}</div>
              <div className="cg-pod-team">{team === 'red' ? 'Red' : 'Blue'} team</div>

              <ul className="cg-pod-players">
                {members.map((p) => (
                  <li key={p.id} className={p.id === room.you.id ? 'is-you' : undefined}>
                    <span className="cg-pod-name">{p.name}</span>
                    <span className="cg-pod-role">
                      {p.role === 'spymaster' ? 'spymaster' : 'operative'}
                    </span>
                    {p.isBot && <span className="tag bot">bot</span>}
                  </li>
                ))}
                {members.length === 0 && <li className="cg-pod-empty">No players</li>}
              </ul>

              <div className="cg-pod-block">
                <span className="cg-pod-step" aria-hidden>
                  {won ? '1' : '2'}
                </span>
                <span className="cg-pod-score">
                  {won && byTrap ? '—' : left}
                  <span className="cg-pod-unit">{won && byTrap ? '' : ' left'}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
