import GameEntry from '../../lib/GameEntry';
import { Note, Rules } from '../../lib/GameRules';

export default function InfiltratorEntry() {
  return (
    <GameEntry
      game="infiltrator"
      title="Infiltrator"
      blurb="Everyone shares a secret location, except one player who has no idea where they are. Question each other to expose the infiltrator before they work it out."
    >
      <Rules
        game="infiltrator"
        goal="If you know the location, expose the infiltrator. If you are the infiltrator, blend in and work out where everyone is."
        steps={[
          <>
            Each round everyone is dealt the same secret location plus a personal role, like &ldquo;Hotel · Bellman&rdquo;.
            One random player is the <strong>infiltrator</strong> and sees neither.
          </>,
          <>
            Take turns asking each other questions out loud, one player to another. Answers should prove you know where
            you are without spelling it out for the infiltrator.
          </>,
          <>
            Suspect someone? Accuse them. Everyone except the accused votes, and the accusation only sticks if it is
            unanimous. The clock pauses during the vote, and you each get one accusation per round.
          </>,
          <>
            Convict the infiltrator and the location crew wins. Convict an innocent player and the infiltrator wins
            straight away, so be sure before you push.
          </>,
          <>
            The infiltrator can stop the round at any time and name the location. Right, and they win. Wrong, and
            everyone else does.
          </>,
          <>
            If time runs out, everyone votes at once. A clear majority on the infiltrator catches them. A tie or a wrong
            answer means the infiltrator escapes.
          </>,
        ]}
        notes={[
          <Note k="Scoring">
            Each non-infiltrator scores 1 when the infiltrator is caught, and a successful accuser gets 1 more. The
            infiltrator scores 2 for surviving, or 4 for naming the location or getting an innocent convicted.
          </Note>,
          <Note k="Timing">
            The host types the round length, anywhere from 1 to 20 minutes. Rounds keep score across the session.
          </Note>,
        ]}
      />
    </GameEntry>
  );
}
