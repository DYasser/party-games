import type { GuessView, Mark } from '@shared/wordrace/types';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const RANK: Record<Mark, number> = { x: 1, y: 2, g: 3 };

/** Best-known status per letter across all of a player's marked guesses. */
export function letterStatuses(guesses: GuessView[]): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const g of guesses) {
    if (!g.word) continue;
    g.word.split('').forEach((ch, i) => {
      const m = g.marks[i];
      if (!out[ch] || RANK[m] > RANK[out[ch]]) out[ch] = m;
    });
  }
  return out;
}

interface Props {
  statuses: Record<string, Mark>;
  onKey: (key: string) => void;
  disabled?: boolean;
}

export default function Keyboard({ statuses, onKey, disabled = false }: Props) {
  return (
    <div className="wordrace-keyboard" aria-label="On-screen keyboard">
      {ROWS.map((row, i) => (
        <div key={row} className="wordrace-keyrow">
          {i === 2 && (
            <button type="button" className="wordrace-key wide" onClick={() => onKey('Enter')} disabled={disabled}>
              Enter
            </button>
          )}
          {row.split('').map((ch) => (
            <button
              key={ch}
              type="button"
              className={`wordrace-key ${statuses[ch] ?? ''}`}
              onClick={() => onKey(ch)}
              disabled={disabled}
              aria-label={ch}
            >
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button
              type="button"
              className="wordrace-key wide"
              onClick={() => onKey('Backspace')}
              disabled={disabled}
              aria-label="Backspace"
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
