import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Called with a valid, clamped value. Never called while the box is mid-edit. */
  onCommit: (value: number) => void;
  /** Host-only controls are read-only for everyone else. */
  disabled?: boolean;
  /** Shown after the number, e.g. "rounds" or "min". */
  suffix?: string;
  step?: number;
  /** Extra guidance under the field. */
  hint?: string;
  /**
   * Render this value as "∞" instead of the number, for settings where a
   * sentinel means "no limit". Typing the number still works; it is only the
   * display that changes, so 0 never reads as "zero seconds to play".
   */
  infinityAt?: number;
}

/**
 * A typed number input with stepper buttons, for settings like round counts and
 * timers. The user can type freely; the value is clamped and committed on blur,
 * Enter, or a stepper press, so a half-typed "1" never becomes a real setting.
 */
export default function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  disabled = false,
  suffix,
  step = 1,
  hint,
  infinityAt,
}: Props) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow the server's value unless the user is actively typing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  const nudge = (delta: number) => {
    const base = Number.parseInt(draft, 10);
    const from = Number.isFinite(base) ? base : value;
    const next = Math.min(max, Math.max(min, from + delta));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  const parsed = Number.parseInt(draft, 10);
  const outOfRange = draft !== '' && Number.isFinite(parsed) && (parsed < min || parsed > max);
  // Show the symbol only when the field is idle: while typing, the real number
  // has to be visible or editing becomes guesswork.
  const isInfinite = infinityAt !== undefined && value === infinityAt && !focused;

  if (disabled) {
    return (
      <div className="numfield">
        <span className="numfield-label">{label}</span>
        <div className="numfield-readonly">
          <strong>{isInfinite ? '∞' : value}</strong>
          {suffix && !isInfinite && <span className="numfield-suffix">{suffix}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="numfield">
      <label className="numfield-label" htmlFor={`nf-${label}`}>
        {label}
      </label>
      <div className={`numfield-control ${outOfRange ? 'invalid' : ''}`}>
        <button
          type="button"
          className="numfield-step"
          onClick={() => nudge(-step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          id={`nf-${label}`}
          className={`numfield-input ${isInfinite ? 'is-infinite' : ''}`}
          type="number"
          inputMode="numeric"
          aria-describedby={isInfinite ? `nf-inf-${label}` : undefined}
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {isInfinite && (
          <span className="numfield-infinity" id={`nf-inf-${label}`} aria-label="no limit">
            ∞
          </span>
        )}
        {suffix && !isInfinite && <span className="numfield-suffix">{suffix}</span>}
        <button
          type="button"
          className="numfield-step"
          onClick={() => nudge(step)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
      <span className={`numfield-hint ${outOfRange ? 'warn' : ''}`}>
        {outOfRange ? `Enter ${min}–${max}.` : (hint ?? `${min}–${max}`)}
      </span>
    </div>
  );
}
