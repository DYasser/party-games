import { useEffect, useRef, useState } from 'react';
import type { Team } from '@shared/ciphergrid/types';

type Stage = 'strike' | 'verdict' | 'done';

/** How long each stage lasts. */
const TIMINGS: Record<Exclude<Stage, 'done'>, number> = {
  strike: 1500,
  verdict: 2600,
};

interface Props {
  winner: Team;
  /** True when the game ended because somebody hit the trap card. */
  byTrap: boolean;
  /** The word on the card that ended it, for the trap reveal. */
  word?: string;
  /** The winning team's players, named on the verdict card. */
  winners: string[];
  onDone: () => void;
}

/**
 * The end of a game, played out rather than announced.
 *
 * Hitting the trap card is the most dramatic way to lose, so it gets a proper
 * beat: the screen goes dark, the card cracks open in red, and only then does
 * the winning team's card rise. A normal win skips the strike and goes straight
 * to the verdict.
 *
 * Purely presentational — the server has already ended the game. It plays once
 * and can always be skipped.
 */
export default function GameOverReveal({ winner, byTrap, word, winners, onDone }: Props) {
  const [stage, setStage] = useState<Stage>(byTrap ? 'strike' : 'verdict');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduced) {
      doneRef.current();
      return;
    }
    const timers: number[] = [];
    let elapsed = 0;
    if (byTrap) {
      elapsed += TIMINGS.strike;
      timers.push(window.setTimeout(() => setStage('verdict'), elapsed));
    }
    elapsed += TIMINGS.verdict;
    timers.push(
      window.setTimeout(() => {
        setStage('done');
        doneRef.current();
      }, elapsed),
    );
    return () => timers.forEach(clearTimeout);
  }, [byTrap, reduced]);

  if (reduced || stage === 'done') return null;

  const skip = () => {
    setStage('done');
    doneRef.current();
  };

  return (
    <div className={`cg-over ${byTrap ? 'by-trap' : ''} stage-${stage} winner-${winner}`} role="presentation">
      <div className="cg-over-veil" />

      {stage === 'strike' && (
        <div className="cg-over-strike">
          <div className="cg-trap-card">
            <span className="cg-trap-crack" aria-hidden />
            <span className="cg-trap-skull" aria-hidden>
              ☠
            </span>
            {word && <span className="cg-trap-word">{word}</span>}
          </div>
          <p className="cg-over-kicker">The trap card</p>
        </div>
      )}

      {stage === 'verdict' && (
        <div className="cg-over-verdict">
          <p className="cg-over-kicker">{byTrap ? 'They touched the trap' : 'All agents contacted'}</p>
          <h2 className="cg-over-title">{winner === 'red' ? 'Red' : 'Blue'} team wins</h2>
          {winners.length > 0 && (
            <ul className="cg-over-winners">
              {winners.map((name, i) => (
                <li key={name} style={{ animationDelay: `${240 + i * 90}ms` }}>
                  {name}
                </li>
              ))}
            </ul>
          )}
          <div className="cg-over-rays" aria-hidden>
            {Array.from({ length: 10 }).map((_, i) => (
              <i key={i} style={{ transform: `rotate(${i * 36}deg)` }} />
            ))}
          </div>
        </div>
      )}

      <button className="btn small ghost cg-over-skip" onClick={skip}>
        Skip
      </button>
    </div>
  );
}
