import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { computeAwards, type Award } from '@shared/awards';
import type { ReactionKey } from '@shared/celebration';
import {
  AwardList,
  ConfettiCannon,
  FlyingReactions,
  ReactionPicker,
  ReactionTally,
} from './CelebrationLayer';
import type { CelebrationState } from './useCelebration';

export interface PodiumEntry {
  id: string;
  name: string;
  score: number;
  isBot?: boolean;
  isYou?: boolean;
  /** Optional line under the name, e.g. "solved 3 of 4". */
  detail?: ReactNode;
}

interface Props {
  entries: PodiumEntry[];
  /** Word for the score unit, e.g. "pts". */
  unit?: string;
  /** Extra content between the podium and the runner-up list. */
  children?: ReactNode;
  /**
   * Pass the result of `useCelebration` to make the podium interactive: players
   * can fling reactions at each other and fire confetti. Omit it and the podium
   * renders exactly as before.
   */
  celebration?: CelebrationState;
  /** Extra awards to show alongside the score-derived ones. */
  extraAwards?: Award[];
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scores count up to their final value once the row appears. Starts at the
 * target (not zero) so a non-animating render — server-side, reduced motion,
 * or a cancelled frame — always shows the real score rather than 0.
 */
function useCountUp(target: number, delayMs: number, durationMs = 900) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (target === 0 || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    setValue(0);
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      // Ease out, so it decelerates into the final number.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      setValue(target);
    };
  }, [target, delayMs, durationMs]);

  return value;
}

/** Standard competition ranking: equal scores share a place. */
function rank(entries: PodiumEntry[]): { entry: PodiumEntry; place: number }[] {
  const sorted = entries.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 0;
  let lastScore: number | null = null;
  return sorted.map((entry, i) => {
    if (lastScore === null || entry.score !== lastScore) {
      place = i + 1;
      lastScore = entry.score;
    }
    return { entry, place };
  });
}

const MEDALS = ['🥇', '🥈', '🥉'];

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/**
 * Animated end-of-game podium. The top three rise into place (third, then
 * second, then first), scores count up, and the winner gets a confetti burst.
 * Everyone else is listed below.
 *
 * With a `celebration` prop it also becomes a playground: tap any player to
 * fling emoji at them, watch them fly on everyone's screen, and fire confetti
 * for the whole room.
 */
export default function Podium({ entries, unit = 'pts', children, celebration, extraAwards }: Props) {
  const ranked = useMemo(() => rank(entries), [entries]);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const [picking, setPicking] = useState<string | null>(null);

  const winnerScore = top[0]?.entry.score ?? 0;
  const isTiedWin = top.filter((t) => t.entry.score === winnerScore).length > 1 && winnerScore > 0;

  const awards = useMemo(() => {
    const scoreAwards = computeAwards(
      entries.map((e) => ({ id: e.id, name: e.name, score: e.score, isBot: e.isBot })),
    );
    return [...(extraAwards ?? []), ...scoreAwards].slice(0, 4);
  }, [entries, extraAwards]);

  const nameOf = (id: string) => entries.find((e) => e.id === id)?.name ?? 'somebody';

  /**
   * Visual order is 2nd, 1st, 3rd left to right, with the centre tallest.
   * Height follows the slot, not the place, so tied players (who share a place)
   * still get distinct pillars instead of a short block labelled "1st".
   */
  const stageOrder = useMemo(() => {
    const slots: { slot: (typeof ranked)[number]; height: string; delayMs: number }[] = [];
    // [entry index, height class, rise delay] — third rises first, first last.
    const layout: [number, string, number][] = [
      [1, 'podium-mid', 260],
      [0, 'podium-tall', 520],
      [2, 'podium-short', 0],
    ];
    for (const [index, height, delayMs] of layout) {
      const slot = top[index];
      if (slot) slots.push({ slot, height, delayMs });
    }
    return slots;
  }, [ranked, top]);

  const throwAt = (toId: string, which: ReactionKey) => celebration?.react(toId, which);
  const interactive = !!celebration;

  return (
    <div className="podium-wrap">
      <div className="podium-crown">
        <h2 className="podium-title">
          {isTiedWin ? "It's a tie!" : top[0] ? `${top[0].entry.name} wins!` : 'Game over'}
        </h2>
        {top[0] && !isTiedWin && (
          <p className="podium-sub">
            {winnerScore} {unit}
          </p>
        )}
      </div>

      <div className="podium-stage" role="list">
        {stageOrder.map(({ slot, height, delayMs }) => (
          <PodiumBlock
            key={slot.entry.id}
            entry={slot.entry}
            place={slot.place}
            height={height}
            unit={unit}
            delayMs={delayMs}
            interactive={interactive}
            counts={celebration?.tally[slot.entry.id]}
            picking={picking === slot.entry.id}
            onPickOpen={() => setPicking((cur) => (cur === slot.entry.id ? null : slot.entry.id))}
            onPickClose={() => setPicking(null)}
            onThrow={throwAt}
          />
        ))}
      </div>

      {top[0] && (
        <div className="podium-confetti" aria-hidden>
          {Array.from({ length: 28 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${900 + (i % 7) * 90}ms`,
                background: ['#ff4d6d', '#3d8bff', '#9d6bff', '#38e1ff', '#6cf5c2', '#f5b544'][i % 6],
                transform: `rotate(${(i * 53) % 360}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {interactive && (
        <div className="celebrate-bar">
          <span className="celebrate-hint">
            <span aria-hidden>👉</span> Tap a player to react
          </span>
          <ConfettiCannon celebration={celebration!} />
        </div>
      )}

      {awards.length > 0 && <AwardList awards={awards} nameOf={nameOf} />}

      {children}

      {rest.length > 0 && (
        <ol className="podium-rest" start={4}>
          {rest.map(({ entry, place }, i) => (
            <li
              key={entry.id}
              className={entry.isYou ? 'you' : ''}
              style={{ animationDelay: `${1000 + i * 70}ms` }}
              data-celebrate-anchor={entry.id}
            >
              <span className="podium-rest-place">{place}</span>
              <span className="podium-rest-name">
                {entry.name}
                {entry.isYou && <span className="muted"> (you)</span>}
                {entry.isBot && <span className="tag bot">bot</span>}
                <ReactionTally counts={celebration?.tally[entry.id]} />
              </span>
              {entry.detail && <span className="podium-rest-detail">{entry.detail}</span>}
              <strong className="podium-rest-score">
                {entry.score} <span className="podium-unit">{unit}</span>
              </strong>
              {interactive && (
                <span className="podium-rest-react">
                  <button
                    className="btn small ghost react-open"
                    onClick={() => setPicking((cur) => (cur === entry.id ? null : entry.id))}
                    aria-label={`React to ${entry.name}`}
                  >
                    <span aria-hidden>😀</span>
                  </button>
                  {picking === entry.id && (
                    <ReactionPicker
                      targetName={entry.name}
                      onPick={(which) => throwAt(entry.id, which)}
                      onClose={() => setPicking(null)}
                    />
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {celebration && <FlyingReactions flying={celebration.flying} />}
    </div>
  );
}

function PodiumBlock({
  entry,
  place,
  height,
  unit,
  delayMs,
  interactive,
  counts,
  picking,
  onPickOpen,
  onPickClose,
  onThrow,
}: {
  entry: PodiumEntry;
  place: number;
  /** Pillar height class, driven by stage slot rather than place. */
  height: string;
  unit: string;
  delayMs: number;
  interactive: boolean;
  counts: Partial<Record<ReactionKey, number>> | undefined;
  picking: boolean;
  onPickOpen: () => void;
  onPickClose: () => void;
  onThrow: (toId: string, which: ReactionKey) => void;
}) {
  const score = useCountUp(entry.score, delayMs + 400);
  return (
    <div
      className={`podium-block ${height} place-${place}`}
      style={{ animationDelay: `${delayMs}ms` }}
      role="listitem"
    >
      <div className="podium-figure" style={{ animationDelay: `${delayMs + 150}ms` }}>
        <span className="podium-medal" aria-hidden>
          {MEDALS[place - 1]}
        </span>
        {interactive ? (
          <button
            className="podium-name as-button"
            data-celebrate-anchor={entry.id}
            onClick={onPickOpen}
            aria-label={`React to ${entry.name}`}
          >
            {entry.name}
            {entry.isYou && <span className="muted"> (you)</span>}
          </button>
        ) : (
          <span className="podium-name" data-celebrate-anchor={entry.id}>
            {entry.name}
            {entry.isYou && <span className="muted"> (you)</span>}
          </span>
        )}
        {entry.isBot && <span className="tag bot">bot</span>}
        {entry.detail && <span className="podium-detail">{entry.detail}</span>}
        <ReactionTally counts={counts} />
        {picking && (
          <ReactionPicker
            targetName={entry.name}
            onPick={(which) => onThrow(entry.id, which)}
            onClose={onPickClose}
          />
        )}
      </div>
      <div className="podium-pillar">
        <span className="podium-score">
          <span className="podium-score-value">{score}</span>
          {unit && <span className="podium-unit">{unit}</span>}
        </span>
        <span className="podium-place" aria-label={`Place ${place}`}>
          {ordinal(place)}
        </span>
      </div>
    </div>
  );
}
