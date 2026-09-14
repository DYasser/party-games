import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function CipherGridEntry() {
  return (
    <GameEntry
      game="ciphergrid"
      title="Cipher Grid"
      blurb="Two teams race to find their own agents in a grid of 25 words, guided by one-word clues from their spymaster. One word ends the game on the spot."
    >
      <Rules
        game="ciphergrid"
        goal="Be the first team to reveal all of your own agents, without touching the trap card."
        steps={[
          <>
            Split into a red team and a blue team. Each team picks one <strong>spymaster</strong>; everyone else on the
            team is an <strong>operative</strong>. Both teams need at least one of each to start.
          </>,
          <>
            The board is 25 words. The spymasters see the secret key: 9 words for the team that starts, 8 for the other,
            7 innocent bystanders, and 1 trap card. Operatives just see 25 words.
          </>,
          <>
            On your team&apos;s turn the spymaster gives a single word and a number, like <strong>OCEAN 2</strong>, meaning
            two words on the board relate to &ldquo;ocean&rdquo;. The clue cannot be a word visible on the board.
          </>,
          <>
            The operatives talk it over and tap a word. Tap one of your own and you may keep guessing, up to the number
            plus one bonus guess.
          </>,
          <>
            Tap a bystander or an enemy agent and your turn ends immediately. Tap the <strong>trap card</strong> and your
            team loses on the spot.
          </>,
          <>
            Turns alternate until one team has revealed all of its agents. That team wins.
          </>,
        ]}
        notes={[
          <Note k="Clues">
            One word, no spaces. Choosing 0 or ∞ as the number means unlimited guesses for that turn.
          </Note>,
          <Note k="Teams">
            The host can shuffle everyone into balanced teams, and can reset back to the lobby at any time.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
