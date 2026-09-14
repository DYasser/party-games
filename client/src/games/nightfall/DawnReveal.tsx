import { useEffect, useRef, useState } from 'react';
import type { Role } from '@shared/nightfall/types';
import PlayerCard from './PlayerCard';

/**
 * The dawn reveal.
 *
 * A card rises alone in the middle of the screen, face-down and breathing, and
 * then one of two things happens:
 *
 *  - **Killed.** The card cracks, spins a full turn on its Y axis to show the
 *    role underneath, and flies off to join the dead in the roster.
 *  - **Saved.** A ward flares around it, the card turns to show it is unharmed,
 *    and it returns to the table intact. No role is revealed, because the
 *    Healer's save tells the town nothing about who they protected.
 *
 * Purely presentational: the server has already resolved the night by the time
 * this plays. It runs once per night and can always be skipped.
 */

type Stage = 'float' | 'impact' | 'flip' | 'depart' | 'done';

/** How long each stage lasts. The sum is the full cinematic. */
const TIMINGS: Record<Exclude<Stage, 'done'>, number> = {
  float: 1500,
  impact: 800,
  flip: 1400,
  depart: 900,
};

const ORDER: Exclude<Stage, 'done'>[] = ['float', 'impact', 'flip', 'depart'];

interface Props {
  /**
   * The victim's name, or null on a save — a saved player stays anonymous,
   * because naming them would tell the table who the Healer guarded.
   */
  name: string | null;
  /** The victim's role, shown mid-flip. Null when they were saved. */
  role: Role | null;
  /** True when the Healer's ward held and nobody died. */
  saved: boolean;
  isBot?: boolean;
  isYou?: boolean;
  day: number;
  onDone: () => void;
}

export default function DawnReveal({ name, role, saved, isBot, isYou, day, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('float');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Respect a reduced-motion preference by skipping straight to the end.
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduced) {
      doneRef.current();
      return;
    }
    const timers: number[] = [];
    let elapsed = 0;
    for (let i = 1; i < ORDER.length; i++) {
      elapsed += TIMINGS[ORDER[i - 1]];
      const next = ORDER[i];
      timers.push(window.setTimeout(() => setStage(next), elapsed));
    }
    elapsed += TIMINGS.depart;
    timers.push(
      window.setTimeout(() => {
        setStage('done');
        doneRef.current();
      }, elapsed),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  if (reduced || stage === 'done') return null;

  const struck = stage === 'impact' || stage === 'flip' || stage === 'depart';
  // The role only appears once the card has turned past its edge, and only
  // when they actually died — a save must never leak the Healer's target.
  const showRole = !saved && (stage === 'flip' || stage === 'depart');
  // An anonymous card for a save; the real name only on a kill.
  const shown = name ?? 'Someone';

  return (
    <div className={`nf-dawn ${saved ? 'is-saved' : 'is-killed'}`} role="presentation">
      <div className="nf-dawn-veil" />

      <div className="nf-dawn-stage">
        <p className={`nf-dawn-caption ${stage === 'float' ? 'in' : 'out'}`}>
          Dawn of day {day}
          <strong>
            {saved ? 'The Shades struck, but a ward held' : `${shown} did not survive the night`}
          </strong>
        </p>

        <div className={`nf-dawn-card stage-${stage}`}>
          {struck &&
            (saved ? (
              <>
                <span className="nf-dawn-ward" aria-hidden />
                <span className="nf-dawn-ward-ring" aria-hidden />
                <span className="nf-dawn-ward-mark" aria-hidden />
              </>
            ) : (
              <>
                <span className="nf-dawn-crack" aria-hidden />
                <span className="nf-dawn-shard left" aria-hidden />
                <span className="nf-dawn-shard right" aria-hidden />
              </>
            ))}

          <div className="nf-dawn-flip-space">
            <div className="nf-dawn-flipper">
              <div className="nf-dawn-face front">
                <PlayerCard name={shown} role={null} alive isBot={isBot} isYou={isYou} />
              </div>
              <div className="nf-dawn-face back">
                <PlayerCard
                  name={shown}
                  role={showRole ? role : null}
                  // A saved player is still very much alive.
                  alive={saved}
                  isBot={isBot}
                  isYou={isYou}
                  note={saved ? 'the ward held' : 'eliminated'}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn small ghost nf-dawn-skip"
          onClick={() => {
            setStage('done');
            doneRef.current();
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
