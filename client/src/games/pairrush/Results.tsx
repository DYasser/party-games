import type { PairRushView } from '@shared/pairrush/types';

/** m:ss.t — tenths matter when two people finish seconds apart. */
export function formatRaceTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const tenth = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
}

/**
 * The final standings, shown on its own once the race is over.
 *
 * Ranked by finish order, with the time each player took and how many flips it
 * cost them. Anyone who ran out of time is listed below the finishers with how
 * far they got, rather than being dropped — you still want to see that you were
 * one pair away.
 */
export default function Results({
  state,
  you,
  isHost,
  onAgain,
}: {
  state: PairRushView;
  you: { id: string; name: string };
  isHost: boolean;
  onAgain: () => void;
}) {
  const rows = [
    {
      id: you.id,
      name: you.name,
      isYou: true,
      isBot: false,
      pairsFound: state.pairsFound,
      attempts: state.attempts,
      finishOrder: state.finishOrder,
      finishMs: state.finishMs,
    },
    ...state.rivals.map((r) => ({ ...r, isYou: false })),
  ];

  rows.sort((a, b) => {
    if (a.finishOrder !== null && b.finishOrder !== null) return a.finishOrder - b.finishOrder;
    if (a.finishOrder !== null) return -1;
    if (b.finishOrder !== null) return 1;
    return b.pairsFound - a.pairsFound;
  });

  const winner = rows.find((r) => r.finishOrder === 1);
  const best = rows.filter((r) => r.finishMs !== null).map((r) => r.finishMs as number);
  const fastest = best.length > 0 ? Math.min(...best) : null;

  return (
    <div className="pr-results">
      <header className="pr-results-head">
        <h2>Final standings</h2>
        {winner ? (
          <p className="muted">
            <strong className="pr-winner-name">{winner.isYou ? 'You' : winner.name}</strong>{' '}
            cleared all {state.pairsTotal} pairs first
            {winner.finishMs !== null && <> in {formatRaceTime(winner.finishMs)}</>}.
          </p>
        ) : (
          <p className="muted">Time ran out before anyone cleared the board.</p>
        )}
      </header>

      <ol className="pr-result-list">
        {rows.map((r) => {
          const placed = r.finishOrder !== null;
          return (
            <li
              key={r.id}
              className={`pr-result ${r.isYou ? 'is-you' : ''} ${placed ? '' : 'unplaced'} ${
                r.finishOrder === 1 ? 'first' : ''
              }`}
            >
              <span className="pr-result-place">{placed ? `#${r.finishOrder}` : '—'}</span>

              <span className="pr-result-name">
                {r.name}
                {r.isYou && <span className="muted"> (you)</span>}
                {r.isBot && <span className="tag bot">bot</span>}
              </span>

              <span className="pr-result-stats">
                <span
                  className={`pr-result-time ${r.finishMs !== null && r.finishMs === fastest ? 'best' : ''}`}
                >
                  {r.finishMs !== null ? formatRaceTime(r.finishMs) : `${r.pairsFound}/${state.pairsTotal} pairs`}
                </span>
                <span className="pr-result-flips muted small-text">
                  {r.attempts} flip{r.attempts === 1 ? '' : 's'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {isHost && (
        <div className="pr-results-actions">
          <button className="btn primary" onClick={onAgain}>
            Race again
          </button>
        </div>
      )}
    </div>
  );
}
