import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function NightfallEntry() {
  return (
    <GameEntry
      game="nightfall"
      title="Nightfall"
      blurb="A hidden-role game of night raids and daylight arguments. A few Shades pick off the Town after dark, and the Town votes back by day."
    >
      <Rules
        game="nightfall"
        goal="The Town has to banish every Shade. The Shades have to outlast the Town."
        steps={[
          <>
            Everyone is dealt a secret role. The <strong>Shades</strong> know each other: one for up to 6 players, two up
            to 9, three beyond that. Everyone else is the <strong>Town</strong>, including one <strong>Oracle</strong>,
            one <strong>Healer</strong> at 5 or more players, and plain <strong>Townsfolk</strong>.
          </>,
          <>
            <strong>Night.</strong> Roles wake one at a time: the <strong>Shades</strong> first, then the{' '}
            <strong>Oracle</strong>, then the <strong>Healer</strong>. Everyone else sees a waiting screen naming whose
            turn it is. On your turn, tap a card to choose a target and press <strong>Ready</strong> to lock it in. You
            can change your mind freely until you do, but not after.
          </>,
          <>
            The Shades agree on a victim, the Oracle learns whether one player is a Shade, and the Healer shields one
            player, never the same person two nights running. Shades can always see each other.
          </>,
          <>
            If the Shades struck someone the Healer shielded, nobody dies and the morning is quiet. Otherwise the victim
            is out, and their role stays hidden.
          </>,
          <>
            <strong>Day.</strong> The night&apos;s result is announced. Voting stays locked for the first 10 seconds so
            the table has to talk before anyone can railroad a decision. Then vote in the open to banish someone or to
            skip; you can change your vote until the day resolves.
          </>,
          <>
            The most votes gets banished and their role is revealed for everyone to see. A tie, or a majority to skip,
            banishes nobody.
          </>,
          <>
            Night and day alternate until one side wins: the <strong>Town</strong> when no Shades remain, or the{' '}
            <strong>Shades</strong> when they equal or outnumber the living Town.
          </>,
        ]}
        notes={[
          <Note k="The dead">
            Eliminated players see everyone&apos;s roles and the full history, but cannot vote or talk in the game. Keep
            a straight face.
          </Note>,
          <Note k="Turn order">
            Roles wake one at a time, Shades first, then the Oracle, then the Healer. Each role gets its own clock,
            so a slow coven never eats anyone else&apos;s turn.
          </Note>,
          <Note k="Timing">
            The host sets all of it in Game settings: how long each role gets, how long the day is, and how long
            you must talk before voting opens. They can also allow or forbid ending the discussion early.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
