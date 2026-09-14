import type { PairRushView } from '@shared/pairrush/types';

/**
 * The rivals panel.
 *
 * Shows how far along everyone is and nothing else — the server never sends
 * which cards a rival has turned over, so there is nothing here that could be
 * used to cheat, only the pressure of watching someone gain on you.
 */
export default function Standings({
  state,
  you,
}: {
  state: PairRushView;
  you: { id: string; name: string };
}) {
  const rows = [
    {
      id: you.id,
      name: you.name,
      isYou: true,
      isBot: false,
      connected: true,
      pairsFound: state.pairsFound,
      attempts: state.attempts,
      finishOrder: state.finishOrder,
    },
    ...state.rivals.map((r) => ({ ...r, isYou: false })),
  ];

  // Furthest along first; finishers always above anyone still solving.
  rows.sort((a, b) => {
    if (a.finishOrder !== null && b.finishOrder !== null) return a.finishOrder - b.finishOrder;
    if (a.finishOrder !== null) return -1;
    if (b.finishOrder !== null) return 1;
    return b.pairsFound - a.pairsFound;
  });

  const total = state.pairsTotal || 1;

  return (
    <section className="card pr-standings">
      <h3>{state.phase === 'ended' ? 'Final standings' : 'Race'}</h3>

      <ul className="pr-racers">
        {rows.map((r) => {
          const pct = Math.round((r.pairsFound / total) * 100);
          return (
            <li key={r.id} className={`pr-racer ${r.isYou ? 'is-you' : ''} ${!r.connected ? 'offline' : ''}`}>
              <div className="pr-racer-head">
                <span className="pr-racer-name">
                  {r.finishOrder !== null && <span className="pr-place">#{r.finishOrder}</span>}
                  {r.name}
                  {r.isYou && <span className="muted"> (you)</span>}
                  {r.isBot && <span className="tag bot">bot</span>}
                  {!r.connected && <span className="tag">away</span>}
                </span>
                <span className="pr-racer-score">
                  {r.pairsFound}/{state.pairsTotal}
                </span>
              </div>

              <div className="pr-bar" role="presentation">
                <div
                  className={`pr-bar-fill ${r.finishOrder !== null ? 'done' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <span className="pr-racer-meta muted small-text">
                {r.attempts} flip{r.attempts === 1 ? '' : 's'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
