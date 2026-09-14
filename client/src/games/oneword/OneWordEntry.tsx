import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function OneWordEntry() {
  return (
    <GameEntry
      game="oneword"
      title="One Word"
      blurb="A cooperative word game. Everyone writes a single hint for the guesser, but any hint two people think of is thrown away before it helps."
    >
      <Rules
        game="oneword"
        goal="Work together to guess as many of the 13 secret words as you can. One score for the whole room."
      steps={[
          <>
            The room shares a deck of 13 secret words. Each card, one player is the <strong>guesser</strong> and the rest
            are <strong>hinters</strong>. The role rotates every card.
          </>,
          <>
            Hinters see the secret word and write exactly one hint each: a single word, no spaces. It cannot be the
            secret word, contain it, or be contained by it.
          </>,
          <>
            Before the guesser sees anything, the hints are compared. Any hint that two or more people wrote is
            <strong> cancelled automatically</strong>, plurals included. That is the whole trick: think of something
            nobody else will.
          </>,
          <>
            Hinters can also strike out any remaining hint that breaks the spirit of the rules, then mark themselves
            ready.
          </>,
          <>
            The guesser sees only the surviving hints and gets one attempt. Correct scores a point. They may also{' '}
            <strong>pass</strong>, which simply discards the card.
          </>,
          <>
            A wrong guess costs you the card <strong>and</strong> discards the next one from the deck, so a bad guess is
            worse than passing.
          </>,
        ]}
        notes={[
          <Note k="Scoring">
            13 is perfect, 11–12 is awesome, 9–10 great, 7–8 good, 4–6 respectable. Below that, run it back.
          </Note>,
          <Note k="Timing">
            45 seconds to write hints, 30 to review them, 60 for the guess. Missing a deadline just moves things along.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
