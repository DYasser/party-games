import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function BluffDiceEntry() {
  return (
    <GameEntry
      game="bluffdice"
      title="Bluff Dice"
      blurb="Everyone hides a handful of dice and bids on what the whole table is holding. Bids only ever go up, so sooner or later somebody is lying."
    >
      <Rules
        game="bluffdice"
        goal="Be the last player still holding dice."
        steps={[
          <>
            Everyone starts with the same number of dice and rolls them behind their hand. You can only ever see your
            own.
          </>,
          <>
            On your turn you make a <strong>bid</strong> about every die on the table, such as &ldquo;four 5s&rdquo;,
            meaning there are at least four 5s among all the players.
          </>,
          <>
            Each bid must beat the last one: either more dice, or the same number of dice on a higher face. There is no
            passing.
          </>,
          <>
            Think the bid has gone too far? Call <strong>Liar!</strong> instead of bidding. Everyone reveals their dice
            and the table is counted.
          </>,
          <>
            If there really were that many, the bid stands and the challenger loses a die. If not, the bidder loses one.
            Whoever lost it opens the next round.
          </>,
          <>
            Lose your last die and you are out. Play continues, with fewer and fewer dice, until one player remains.
          </>,
        ]}
        notes={[
          <Note k="Wild ones">
            By default 1s count as any face, which pushes the counts higher than you expect. That also means you cannot
            bid on 1s. The host can switch this off.
          </Note>,
          <Note k="Timing">
            45 seconds per turn. Run out and the game makes the smallest legal raise for you, or calls Liar if no raise
            is possible.
          </Note>,
          <Note k="Setup">The host types the starting dice count, 3 to 6 each. Fewer dice means a much shorter game.</Note>,
        ]}
      />
    </GameEntry>
  );
}
