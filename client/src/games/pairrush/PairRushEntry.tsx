import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function PairRushEntry() {
  return (
    <GameEntry
      game="pairrush"
      title="Pair Rush"
      blurb="Everyone races the same shuffled grid at the same time. Turn over two cards, remember what you saw, and clear every pair before anybody else does."
    >
      <Rules
        game="pairrush"
        goal="Be the first to match every pair on your board."
        steps={[
          <>
            Everyone gets the <strong>identical grid</strong>, shuffled once and dealt to all of you. Nobody gets an
            easier board, so the race comes down to memory alone.
          </>,
          <>
            Turn over two cards. If they match they stay face-up and you keep going. If they do not, they flip back and
            you try again — no turns, no waiting for anyone.
          </>,
          <>
            You only ever see <strong>your own</strong> board. The scoreboard shows how many pairs each rival has found,
            but never which cards they turned over.
          </>,
          <>
            The first player to clear the whole grid takes 1st, and the rest keep racing for the places behind them.
          </>,
        ]}
        notes={[
          <Note k="Board">
            The host picks 4×4, 6×6, 8×8 or 10×10. A 6×6 grid is 18 pairs; 10×10 is 50 and genuinely hard.
          </Note>,
          <Note k="Clock">
            There is an overall time limit so a stalled race cannot run forever. Anyone still solving when it expires
            simply does not place.
          </Note>,
          <Note k="Solo">
            One player and a few bots works fine — the bots have a deliberately imperfect memory, so they are beatable.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
