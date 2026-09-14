import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string | number> {
  value: T;
  /** What the trigger and the list show. */
  label: ReactNode;
  /** Optional second line in the list, e.g. a native language name. */
  hint?: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name, since the trigger is a button rather than a <select>. */
  label: string;
  disabled?: boolean;
  /** Narrow variant for a single character or number. */
  compact?: boolean;
  className?: string;
}

/**
 * A themed replacement for `<select>`.
 *
 * A native select's dropdown is drawn by the operating system: it ignores the
 * page's fonts and colours entirely, so it lands as a white system menu in the
 * middle of a dark theme. This renders the list itself.
 *
 * It keeps the keyboard behaviour people expect from a real select:
 *   - Enter, Space, Up/Down open the list
 *   - Up/Down move the highlight, Home/End jump to the ends
 *   - Enter or Space picks, Escape cancels, Tab closes
 *   - typing letters jumps to a matching option
 *   - the list closes on outside click or scroll and always returns focus
 *
 * The list is portalled to <body> and positioned to the trigger, so a card's
 * `overflow` or `backdrop-filter` cannot clip it.
 */
/**
 * Only one list may be open at a time.
 *
 * The outside-click handler covers real pointer input, but it cannot catch
 * every route into `open` (programmatic focus, a synthetic click, a keyboard
 * shortcut). Registering the opener here guarantees the previous list closes
 * however the next one was opened.
 */
let closeOpenList: (() => void) | null = null;

export default function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  compact,
  className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ query: '', at: 0 });
  const listId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (closeOpenList === closeRef.current) closeOpenList = null;
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Kept in a ref so the registry can compare identities across renders.
  const closeRef = useRef(close);
  closeRef.current = close;

  const openList = useCallback(() => {
    if (disabled) return;
    // Shut whichever list was already showing before opening this one.
    if (closeOpenList && closeOpenList !== closeRef.current) closeOpenList();
    closeOpenList = closeRef.current;
    place();
    setActive(selectedIndex);
    setOpen(true);
  }, [disabled, place, selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (option.value !== value) onChange(option.value);
      close();
    },
    [close, onChange, options, value],
  );

  // Never leave a stale closer behind if this select unmounts while open.
  useEffect(
    () => () => {
      if (closeOpenList === closeRef.current) closeOpenList = null;
    },
    [],
  );

  // Follow the trigger if the page moves under an open list.
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    // `true` catches scrolling inside any ancestor, not just the window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, place]);

  // Close when something outside is clicked.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  // Keep the highlighted option in view.
  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  /** Jump to the next option whose label starts with what was typed. */
  const jumpToTyped = useCallback(
    (char: string) => {
      const now = Date.now();
      const state = typeahead.current;
      state.query = now - state.at > 800 ? char : state.query + char;
      state.at = now;
      const query = state.query.toLowerCase();
      const startAt = state.query.length === 1 ? active + 1 : active;
      for (let i = 0; i < options.length; i++) {
        const index = (startAt + i) % options.length;
        const option = options[index];
        if (option.disabled) continue;
        const text = typeof option.label === 'string' ? option.label : String(option.value);
        if (text.toLowerCase().startsWith(query)) {
          setActive(index);
          return;
        }
      }
    },
    [active, options],
  );

  const step = useCallback(
    (from: number, delta: number) => {
      // Skip past disabled options rather than landing on them.
      let index = from;
      for (let i = 0; i < options.length; i++) {
        index = Math.min(options.length - 1, Math.max(0, index + delta));
        if (!options[index]?.disabled) return index;
        if (index === 0 || index === options.length - 1) break;
      }
      return from;
    },
    [options],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        // Typing on a closed select changes the value directly, as natives do.
        e.preventDefault();
        openList();
        jumpToTyped(e.key);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(step(options.length, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(active);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        // Let focus move on, but do not leave the list hanging open.
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          e.preventDefault();
          jumpToTyped(e.key);
        }
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`pg-select ${compact ? 'compact' : ''} ${open ? 'open' : ''} ${className}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
      >
        <span className="pg-select-value">{selected?.label ?? value}</span>
        <span className="pg-select-arrow" aria-hidden>
          ▾
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <ul
            id={listId}
            ref={listRef}
            className={`pg-select-list ${compact ? 'compact' : ''}`}
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${listId}-${active}`}
            style={placement(rect)}
            // Keep focus on the trigger so the keyboard keeps working.
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((option, index) => (
              <li
                key={String(option.value)}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={[
                  'pg-select-option',
                  index === active ? 'active' : '',
                  option.value === value ? 'selected' : '',
                  option.disabled ? 'disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => !option.disabled && setActive(index)}
                onClick={() => commit(index)}
              >
                <span className="pg-select-option-label">{option.label}</span>
                {option.hint && <span className="pg-select-option-hint">{option.hint}</span>}
                {option.value === value && (
                  <span className="pg-select-check" aria-hidden>
                    ✓
                  </span>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

/**
 * Sit the list under the trigger, or above it when there is not enough room
 * below, and never let it run off the bottom of the viewport.
 */
function placement(rect: DOMRect): React.CSSProperties {
  const GAP = 6;
  const MAX = 280;
  const below = window.innerHeight - rect.bottom - GAP;
  const above = rect.top - GAP;
  const dropUp = below < 160 && above > below;
  const maxHeight = Math.min(MAX, Math.max(120, dropUp ? above : below));

  return {
    position: 'fixed',
    left: rect.left,
    minWidth: rect.width,
    maxHeight,
    ...(dropUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
  };
}
