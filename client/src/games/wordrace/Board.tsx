import type { GuessView } from '@shared/wordrace/types';

interface Props {
  guesses: GuessView[];
  maxGuesses: number;
  /** Letters typed into the next row (own board only). */
  current?: string;
  /** Small sidebar/reveal rendering. */
  compact?: boolean;
  /** Briefly shake the current row (invalid submit). */
  shake?: boolean;
}

/** A 6x5 grid of tiles. Rows with marks flip into colour; a missing word renders colour only. */
export default function Board({ guesses, maxGuesses, current = '', compact = false, shake = false }: Props) {
  const rows: Array<{ letters: string[]; marks: (string | null)[]; typed: boolean }> = [];
  for (let r = 0; r < maxGuesses; r++) {
    const g = guesses[r];
    if (g) {
      rows.push({ letters: g.word ? g.word.split('') : ['', '', '', '', ''], marks: g.marks, typed: false });
    } else if (r === guesses.length) {
      rows.push({ letters: current.padEnd(5).split(''), marks: [null, null, null, null, null], typed: true });
    } else {
      rows.push({ letters: ['', '', '', '', ''], marks: [null, null, null, null, null], typed: false });
    }
  }
  return (
    <div className={`wordrace-board ${compact ? 'compact' : ''}`} role="grid" aria-label="Guess board">
      {rows.map((row, r) => (
        <div key={r} className={`wordrace-row ${row.typed && shake ? 'shake' : ''}`} role="row">
          {row.letters.map((ch, c) => {
            const mark = row.marks[c];
            const cls = ['wordrace-tile'];
            if (mark) cls.push(mark);
            if (mark && !ch) cls.push('hidden');
            if (!mark && ch.trim()) cls.push('typed');
            return (
              <div
                key={c}
                className={cls.join(' ')}
                role="gridcell"
                style={mark ? { animationDelay: `${c * 90}ms` } : undefined}
              >
                {ch.trim()}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
