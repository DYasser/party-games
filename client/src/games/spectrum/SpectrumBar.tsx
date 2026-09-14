import type { ReactNode } from 'react';

export interface BarMarker {
  id: string;
  /** 0-100 */
  value: number;
  label: string;
  /** Secondary text shown under the label (e.g. points). */
  sub?: string;
  kind: 'target' | 'guess' | 'you' | 'bot';
}

/**
 * The scoring bands, mirrored either side of the target. Widths are the
 * distances `pointsForDistance` actually uses, so the picture cannot drift
 * away from the rules.
 */
const BANDS = [
  { points: 4, reach: 2 },
  { points: 3, reach: 6 },
  { points: 2, reach: 12 },
  { points: 1, reach: 20 },
] as const;

interface Props {
  left: string;
  right: string;
  markers?: BarMarker[];
  /**
   * Show the scoring bands around this value (0-100). Only pass it when the
   * viewer is allowed to see the target: it gives the position away exactly.
   */
  bandsAround?: number | null;
  /** Overlay content positioned over the track (e.g. the range input). */
  children?: ReactNode;
  className?: string;
}

/**
 * The spectrum: a gradient track with the two extremes at its ends. Markers are
 * absolutely positioned inside an inset box that lines up with the range thumb.
 */
export default function SpectrumBar({
  left,
  right,
  markers = [],
  bandsAround = null,
  children,
  className = '',
}: Props) {
  // Alternate labels above/below so neighbours do not pile onto each other.
  const sorted = markers.slice().sort((a, b) => a.value - b.value);
  const hasTarget = markers.some((m) => m.kind === 'target');
  return (
    <div className={`spectrum-bar ${className}`}>
      <div className="spectrum-labels">
        <span className="spectrum-label left">{left}</span>
        <span className="spectrum-label right">{right}</span>
      </div>
      <div className={`spectrum-track-wrap ${markers.length ? 'has-markers' : ''} ${hasTarget ? 'has-target' : ''}`}>
        <div className="spectrum-track" aria-hidden="true" />

        {/*
         * Scoring bands, widest first, so the narrower ones paint on top and
         * each band shows only its own ring rather than being covered.
         */}
        {bandsAround !== null && (
          <div className="spectrum-bands" aria-hidden="true">
            {BANDS.slice().reverse().map(({ points, reach }) => {
              const from = Math.max(0, bandsAround - reach);
              const to = Math.min(100, bandsAround + reach);
              return (
                <div
                  key={points}
                  className={`spectrum-band band-${points}`}
                  style={{ left: `${from}%`, width: `${to - from}%` }}
                >
                  <span className="spectrum-band-score">+{points}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="spectrum-markers">
          {sorted.map((m, i) => (
            <div
              key={m.id}
              className={`spectrum-marker ${m.kind} ${m.kind === 'target' ? 'above' : i % 2 === 0 ? 'below' : 'above'}`}
              style={{ left: `${m.value}%` }}
              title={`${m.label}: ${m.value}`}
            >
              <span className="spectrum-pin" />
              <span className="spectrum-marker-label">
                <strong>{m.label}</strong>
                {m.sub && <em>{m.sub}</em>}
              </span>
            </div>
          ))}
          {children}
        </div>
      </div>
      <div className="spectrum-scale muted small-text" aria-hidden="true">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}
