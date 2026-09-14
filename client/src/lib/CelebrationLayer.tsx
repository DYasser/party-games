import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REACTIONS, reactionEmoji, type ReactionKey } from '@shared/celebration';
import type { Award } from '@shared/awards';
import type { CelebrationState, FlyingReaction } from './useCelebration';

/* ------------------------------------------------------------------ */
/* Reaction picker                                                     */
/* ------------------------------------------------------------------ */

interface PickerProps {
  targetName: string;
  onPick: (which: ReactionKey) => void;
  onClose: () => void;
}

/** A little tray of emoji to fling at one player. */
export function ReactionPicker({ targetName, onPick, onClose }: PickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-away and Escape both dismiss.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="reaction-picker" ref={ref} role="dialog" aria-label={`React to ${targetName}`}>
      <div className="reaction-picker-head">
        Send to <strong>{targetName}</strong>
      </div>
      <div className="reaction-picker-grid">
        {REACTIONS.map((r) => (
          <button
            key={r.key}
            className="reaction-btn"
            title={r.label}
            aria-label={`${r.label} for ${targetName}`}
            onClick={() => onPick(r.key)}
          >
            <span aria-hidden>{r.emoji}</span>
          </button>
        ))}
      </div>
      <p className="reaction-picker-hint">Tap as many as you like</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flying reactions                                                    */
/* ------------------------------------------------------------------ */

/**
 * Renders reactions in flight. Each one is positioned over its target player's
 * anchor element, looked up by data attribute, so emoji land on the right head
 * regardless of layout.
 */
export function FlyingReactions({ flying }: { flying: FlyingReaction[] }) {
  if (flying.length === 0) return null;
  return (
    <div className="flying-layer" aria-hidden>
      {flying.map((f) => (
        <FlyingOne key={f.uid} reaction={f} />
      ))}
    </div>
  );
}

function FlyingOne({ reaction }: { reaction: FlyingReaction }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    // Find the target's anchor and centre the emoji on it.
    const anchor = document.querySelector<HTMLElement>(`[data-celebrate-anchor="${reaction.toId}"]`);
    const layer = document.querySelector<HTMLElement>('.flying-layer');
    if (!anchor || !layer) return;
    const a = anchor.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    setPos({ left: a.left - l.left + a.width / 2 + reaction.offset, top: a.top - l.top + a.height / 2 });
  }, [reaction.toId, reaction.offset]);

  if (!pos) return null;
  return (
    <span
      className="flying-reaction"
      style={{
        left: pos.left,
        top: pos.top,
        ['--drift' as string]: `${reaction.drift}px`,
      }}
    >
      {reactionEmoji(reaction.which)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Received-reaction badges                                            */
/* ------------------------------------------------------------------ */

/** The emoji a player has collected, shown under their name. */
export function ReactionTally({ counts }: { counts: Partial<Record<ReactionKey, number>> | undefined }) {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => (n ?? 0) > 0);
  if (entries.length === 0) return null;
  return (
    <span className="reaction-tally">
      {entries.map(([key, n]) => (
        <span key={key} className="reaction-tally-item" title={`${n} ${key}`}>
          <span aria-hidden>{reactionEmoji(key as ReactionKey)}</span>
          {(n ?? 0) > 1 && <em>{n}</em>}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Awards                                                              */
/* ------------------------------------------------------------------ */

export function AwardList({ awards, nameOf }: { awards: Award[]; nameOf: (id: string) => string }) {
  if (awards.length === 0) return null;
  return (
    <div className="award-list">
      <h4 className="award-heading">Superlatives</h4>
      <ul>
        {awards.map((a, i) => (
          <li key={a.key} className="award-card" style={{ animationDelay: `${1200 + i * 140}ms` }}>
            <span className="award-emoji" aria-hidden>
              {a.emoji}
            </span>
            <span className="award-body">
              <strong className="award-title">{a.title}</strong>
              <span className="award-who">{nameOf(a.playerId)}</span>
              <span className="award-note">{a.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti cannon                                                     */
/* ------------------------------------------------------------------ */

const COLOURS = ['#ff4d6d', '#3d8bff', '#9d6bff', '#38e1ff', '#6cf5c2', '#f5b544'];

/** Button plus the burst it triggers for everyone in the room. */
export function ConfettiCannon({ celebration }: { celebration: CelebrationState }) {
  const { confetti, fireConfetti } = celebration;
  const [burst, setBurst] = useState<number | null>(null);

  useEffect(() => {
    if (!confetti) return;
    setBurst(confetti.at);
    const timer = window.setTimeout(() => setBurst(null), 2600);
    return () => window.clearTimeout(timer);
  }, [confetti]);

  return (
    <>
      <button className="btn small confetti-btn" onClick={fireConfetti}>
        <span aria-hidden>🎉</span> Confetti
      </button>
      {/*
        * Portalled to <body>. The burst is position: fixed, but `.card` sets a
        * backdrop-filter, and any filter or transform on an ancestor makes that
        * element the containing block for fixed children — so rendered in place
        * the confetti fell inside the results card instead of over the page.
        */}
      {burst !== null &&
        createPortal(
          <div className="confetti-burst" aria-hidden key={burst}>
            {Array.from({ length: 60 }).map((_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 17) % 100}%`,
                  background: COLOURS[i % COLOURS.length],
                  animationDelay: `${(i % 10) * 60}ms`,
                  transform: `rotate(${(i * 41) % 360}deg)`,
                }}
              />
            ))}
          </div>,
          document.body,
        )}
      {confetti && burst !== null && <span className="confetti-credit">{confetti.fromName} popped the confetti</span>}
    </>
  );
}
