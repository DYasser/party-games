import type { RoomView, Team } from '@shared/ciphergrid/types';
import { useSeatDrag } from './useSeatDrag';

interface Props {
  team: Team;
  room: RoomView;
  onJoin: (team: Team, role: 'spymaster' | 'operative') => void;
}

/**
 * One team's side panel.
 *
 * In the lobby the two role blocks double as drop zones, so a player is seated
 * by dragging them straight onto the team they will play for. There is exactly
 * one target per seat, rather than a separate board repeating the same teams.
 */
export default function TeamPanel({ team, room, onJoin }: Props) {
  const { players, you, state } = room;
  const members = players.filter((p) => p.team === team);
  const spymaster = members.find((p) => p.role === 'spymaster');
  const operatives = members.filter((p) => p.role === 'operative');
  const playing = state.phase === 'playing';
  const remaining = playing || state.phase === 'ended' ? state.remaining[team] : null;
  const canSwitchTeam = !playing || you.team === team;
  const isActive = playing && state.turn === team;

  const drag = useSeatDrag();
  const seating = !!drag?.enabled;
  const armed = !!drag?.held;

  /** A role block, which in the lobby is also a drop target. */
  const block = (role: 'spymaster' | 'operative', children: React.ReactNode) => {
    const key = `${team}:${role}`;
    const zone = drag?.zoneProps(key, team, role) ?? {};
    return (
      <div
        className={`role-block ${seating ? 'droppable' : ''} ${armed ? 'armed' : ''} ${
          drag?.over === key ? 'over' : ''
        }`}
        {...zone}
      >
        {children}
      </div>
    );
  };

  return (
    <aside className={`team-panel ${team} ${isActive ? 'active' : ''}`}>
      <div className="team-head">
        <h3>{team === 'red' ? 'Red' : 'Blue'} team</h3>
        {remaining !== null && (
          <span className="remaining" title="Agents left to find">
            {remaining}
          </span>
        )}
      </div>

      {block(
        'spymaster',
        <>
          <div className="role-title">Spymaster</div>
          {spymaster ? (
            <PlayerRow
              player={spymaster}
              you={spymaster.id === you.id}
              host={spymaster.id === room.hostId}
            />
          ) : (
            <span className="muted small-text">{armed ? 'Drop here' : 'Nobody yet'}</span>
          )}
          {(!spymaster || spymaster.id === you.id || spymaster.isBot) &&
            !(you.team === team && you.role === 'spymaster') &&
            canSwitchTeam && (
              <button className="btn small" onClick={() => onJoin(team, 'spymaster')}>
                Become spymaster
              </button>
            )}
        </>,
      )}

      {block(
        'operative',
        <>
          <div className="role-title">Operatives</div>
          {operatives.length === 0 && (
            <span className="muted small-text">{armed ? 'Drop here' : 'Nobody yet'}</span>
          )}
          {operatives.map((p) => (
            <PlayerRow key={p.id} player={p} you={p.id === you.id} host={p.id === room.hostId} />
          ))}
          {!(you.team === team && you.role === 'operative') && canSwitchTeam && (
            <button className="btn small" onClick={() => onJoin(team, 'operative')}>
              Join as operative
            </button>
          )}
        </>,
      )}
    </aside>
  );
}

/** A seated player. Draggable in the lobby for whoever is allowed to move them. */
export function PlayerRow({
  player,
  you,
  host,
}: {
  player: RoomView['players'][number];
  you: boolean;
  host: boolean;
}) {
  const drag = useSeatDrag();
  const movable = drag?.mayMove(player.id) ?? false;
  const props = movable ? drag!.cardProps(player.id) : {};

  return (
    <div
      className={`player-row ${player.connected ? '' : 'offline'} ${movable ? 'movable' : ''} ${
        drag?.held === player.id ? 'lifted' : ''
      }`}
      title={movable ? 'Drag to a seat, or tap then tap a seat' : undefined}
      {...props}
    >
      <span className="player-name">
        {player.name}
        {you && <span className="muted"> (you)</span>}
      </span>
      {player.isBot && (
        <span className="tag bot" title="Computer player">
          bot
        </span>
      )}
      {host && (
        <span className="tag" title="Host">
          host
        </span>
      )}
      {!player.connected && (
        <span className="tag" title="Disconnected">
          away
        </span>
      )}
    </div>
  );
}
