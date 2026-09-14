import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function WordRaceEntry() {
  return (
    <GameEntry
      game="wordrace"
      title="Word Race"
      blurb="Everyone hunts the same five-letter word at the same time. You can watch your rivals' colours fill in, but not their letters."
    >
      <Rules
        game="wordrace"
        goal="Crack the word in as few guesses as you can, and get there before anyone else."
        steps={[
          <>
            Every round deals the same secret five-letter word to the whole room. You each get six guesses and work
            through them independently.
          </>,
          <>
            After each guess your tiles colour in: <strong>green</strong> for the right letter in the right place,{' '}
            <strong>amber</strong> for a letter that is in the word somewhere else, and <strong>grey</strong> for a letter
            that is not in it at all.
          </>,
          <>
            Repeated letters are handled properly. Two ambers means there really are two of that letter still to place.
          </>,
          <>
            The sidebar shows everyone else&apos;s colours as they guess, but never their letters, so you can see who is
            closing in without stealing their work.
          </>,
          <>
            Solving on your first guess scores 60 points, then 50, 40, 30, 20, and 10 on the sixth. Finishing first adds
            15, second adds 10, third adds 5.
          </>,
          <>
            The round ends when everyone has solved or run out of guesses, or when the clock expires. Then the word is
            revealed with everyone&apos;s boards.
          </>,
        ]}
        notes={[
          <Note k="Length">
            The host types the number of rounds (1 to 10) and the minutes per round (1 to 10). Highest total wins.
          </Note>,
          <Note k="Guesses">
            Only real words are accepted, so a nonsense guess is refused rather than wasting one of your six. Answers
            are always everyday words, but you may guess any word the dictionary knows.
          </Note>,
          <Note k="Languages">
            English and French. The host picks in the lobby, and the whole room plays in that language. Accents are
            ignored, so ÉTAIT and ETAIT are the same guess.
          </Note>,
          <Note k="Custom words">
            The host can paste their own list of five-letter answers to theme a game. Guesses are still checked against
            the full dictionary, plus the custom words. You can view the words in play from the lobby.
          </Note>,
          <Note k="Solo">Playable alone against the clock, or against bots that guess like a decent human.</Note>,
        ]}
      />
    </GameEntry>
  );
}
