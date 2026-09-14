import type { ReactNode } from 'react';
import { GAME_INFO, type GameId } from '@shared/room';

/**
 * Standard shape for a game's "How to play": a one-line goal, numbered steps,
 * and an optional footer of extra notes. Keeps all nine games consistent.
 */
export function Rules({
  game,
  goal,
  steps,
  notes,
}: {
  game: GameId;
  goal: ReactNode;
  steps: ReactNode[];
  notes?: ReactNode[];
}) {
  const info = GAME_INFO[game];
  const players =
    info.minPlayers === info.maxPlayers
      ? `${info.minPlayers} players`
      : `${info.minPlayers}–${info.maxPlayers} players`;

  return (
    <div className="rules-body">
      <p className="rules-goal">
        <strong>Goal.</strong> {goal}
      </p>
      <ol className="rules-steps">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <ul className="rules-notes">
        <li>
          <span className="rules-note-key">Players</span> {players}. The host can add bots to fill the room, so you can
          try the game on your own.
        </li>
        {notes?.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled note row, e.g. <Note k="Timing">45 seconds per turn.</Note> */
export function Note({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <span className="rules-note-key">{k}</span> {children}
    </>
  );
}
