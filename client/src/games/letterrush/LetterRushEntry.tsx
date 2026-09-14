import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function LetterRushEntry() {
  return (
    <GameEntry
      game="letterrush"
      title="Letter Rush"
      blurb="One letter, six categories, and a clock. Fill every box fast, but only answers nobody else thought of are worth anything."
    >
      <Rules
        game="letterrush"
        goal="Score points for answers that fit the letter, fit the category, and that no other player wrote."
        steps={[
          <>
            Each round deals one random letter and six categories, such as &ldquo;Things in a backpack&rdquo; or
            &ldquo;Reasons to be late&rdquo;.
          </>,
          <>
            Type one answer per category, each starting with that letter. A leading &ldquo;the&rdquo;, &ldquo;a&rdquo; or
            &ldquo;an&rdquo; is ignored, so &ldquo;a rocket&rdquo; counts for R.
          </>,
          <>
            Press <strong>Done</strong> when your sheet is finished. Writing ends as soon as everyone is done, or when the
            timer expires and whatever you have is submitted.
          </>,
          <>
            <strong>Review.</strong> All the sheets go up side by side. Blanks score nothing, and any answer that two or
            more players wrote scores nothing for all of them.
          </>,
          <>
            Think an answer is a stretch? Flag it. If more than half of the <em>other</em> players flag it too, it is
            rejected and scores nothing.
          </>,
          <>
            Every surviving answer is worth 1 point. Scores lock in when everyone is done reviewing, the 45-second review
            clock runs out, or the host closes it early.
          </>,
        ]}
        notes={[
          <Note k="Length">
            The host types the number of rounds (1 to 10) and the writing time (30 to 180 seconds). Highest total wins.
          </Note>,
          <Note k="Tactics">
            The obvious answer is usually the one somebody else wrote. Second-guess yourself on the easy categories.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
