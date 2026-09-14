import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function SpectrumEntry() {
  return (
    <GameEntry
      game="spectrum"
      title="Spectrum"
      blurb="One player sees a hidden target on a sliding scale and has to describe it in a few words. Everyone else guesses where it sits."
    >
      <Rules
        game="spectrum"
        goal="As the psychic, describe a hidden spot well enough that everyone lands on it. As a guesser, read the clue and place your needle."
        steps={[
          <>
            Each round one player is the <strong>psychic</strong>. The role passes to a new person every round, and bots
            are never chosen.
          </>,
          <>
            Everyone sees a scale between two opposites, like <em>Overrated</em> to <em>Underrated</em>. Only the psychic
            sees the target marker somewhere along it.
          </>,
          <>
            The psychic types a short clue that fits that exact spot. Up to 40 characters, and no digits, so you cannot
            simply say &ldquo;seventy&rdquo; with a number.
          </>,
          <>
            Everyone else drags their needle and presses <strong>Lock In</strong>. You have 60 seconds, and you can keep
            adjusting until you lock.
          </>,
          <>
            On the reveal, the closer your needle, the better: within 1 scores 4 points, within 4 scores 3, within 9
            scores 2, and within 16 scores 1. Miss by more than 16 and you score nothing, so the bands are tight and a
            vague clue is worth very little.
          </>,
          <>
            The psychic scores the average of everyone&apos;s points, rounded off, so a clue that works for the whole room
            pays best.
          </>,
        ]}
        notes={[
          <Note k="Length">The host types any number of rounds from 3 to 20. Highest total when they run out wins.</Note>,
          <Note k="Good clues">
            Aim for a specific example rather than a hedge. &ldquo;Pineapple on pizza&rdquo; beats &ldquo;fairly warm&rdquo;.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
