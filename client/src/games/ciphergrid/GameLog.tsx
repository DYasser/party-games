import { useEffect, useRef } from 'react';
import type { LogEntry } from '@shared/ciphergrid/types';
import { UNLIMITED_CLUE } from '@shared/ciphergrid/types';

export default function GameLog({ log }: { log: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  if (log.length === 0) return null;

  return (
    <section className="game-log" aria-label="Game log">
      <h4>Game log</h4>
      <ol>
        {log.map((entry, i) => (
          <li key={i} className={entry.team}>
            {describe(entry)}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </section>
  );
}

function describe(e: LogEntry): string {
  switch (e.kind) {
    case 'clue':
      return `${e.by} gave the clue ${e.word} ${e.count === UNLIMITED_CLUE ? '∞' : e.count}`;
    case 'guess': {
      const result =
        e.result === 'assassin' ? 'the TRAP' : e.result === 'neutral' ? 'a bystander' : `a ${e.result} agent`;
      return `${e.by} tapped ${e.word} — ${result}`;
    }
    case 'endTurn':
      return `${e.by} ended the turn`;
    case 'timeout':
      return e.phase === 'clue'
        ? `${cap(e.team)}'s spymaster ran out of time`
        : `${cap(e.team)} ran out of guessing time`;
    case 'win':
      return `${e.team.toUpperCase()} team wins${e.reason === 'assassin' ? ' (assassin)' : ''}!`;
  }
}


function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
