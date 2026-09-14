import type { RoomView } from '@shared/ciphergrid/types';
import { PlayerRow } from './TeamPanel';
import { useSeatDrag } from './useSeatDrag';

/**
 * Where players sit before they pick a team, and the place you drag someone
 * back to in order to bench them. The teams themselves are the panels on each
 * side, so this is the only seat the lobby centre owns.
 */
export default function SpectatorBench({ room }: { room: RoomView }) {
  const { players, you } = room;
  const spectators = players.filter((p) => !p.team || !p.role);
  const drag = useSeatDrag();
  const seating = !!drag?.enabled;
  const armed = !!drag?.held;
  const zone = drag?.zoneProps('spectators', null, null) ?? {};

  return (
    <div
      className={`cg-bench ${seating ? 'droppable' : ''} ${armed ? 'armed' : ''} ${
        drag?.over === 'spectators' ? 'over' : ''
      }`}
      {...zone}
    >
      <span className="cg-bench-label">Spectators</span>

      <div className="cg-bench-list">
        {spectators.map((p) => (
          <PlayerRow key={p.id} player={p} you={p.id === you.id} host={p.id === room.hostId} />
        ))}
        {spectators.length === 0 && (
          <span className="cg-bench-empty">{armed ? 'Drop here to bench them' : 'Everyone has a seat'}</span>
        )}
      </div>
    </div>
  );
}
