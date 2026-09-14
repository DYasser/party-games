import { useEffect, useRef, useState } from 'react';

/**
 * A smoothly ticking estimate of the server's clock.
 *
 * Every game view carries a `serverNow`, so a client can correct for a wrong
 * local clock. The obvious implementation — deriving the offset from the latest
 * `serverNow` on every render — makes countdowns *lurch*: each broadcast shifts
 * the baseline mid-count, so the display jumps several seconds at a time
 * instead of ticking once a second.
 *
 * So the offset is sampled once, from the first view we see, and then kept. We
 * only need to correct for clock skew (constant), not for drift (negligible
 * over a round). The local clock then advances the display smoothly.
 *
 * @param serverNow server timestamp from the current view
 * @param intervalMs how often to re-render; 200ms keeps second boundaries crisp
 * @returns the estimated server time in ms, updating on its own
 */
export function useServerClock(serverNow: number, intervalMs = 200): number {
  const offsetRef = useRef<number | null>(null);
  if (offsetRef.current === null) offsetRef.current = serverNow - Date.now();

  const [now, setNow] = useState(() => Date.now() + (offsetRef.current ?? 0));

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now() + (offsetRef.current ?? 0));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

/** Whole seconds left until `endsAt`, never negative. */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Format a remaining-seconds count as mm:ss. */
export function formatClock(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
