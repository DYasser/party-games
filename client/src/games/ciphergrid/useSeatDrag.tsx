import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Role, Team } from '@shared/ciphergrid/types';

interface SeatDrag {
  /** True only in the lobby, where seats can still change. */
  enabled: boolean;
  /** The player currently being dragged, or picked up by tap/keyboard. */
  held: string | null;
  /** The drop zone under the pointer. */
  over: string | null;
  mayMove: (playerId: string) => boolean;
  /** Props to spread onto a draggable player row. */
  cardProps: (playerId: string) => Record<string, unknown>;
  /** Props to spread onto a drop zone. */
  zoneProps: (key: string, team: Team | null, role: Role | null) => Record<string, unknown>;
}

/** A click already consumed by a player card, so zones underneath ignore it. */
type CardClick = MouseEvent & { seatCardHandled?: boolean };

const Ctx = createContext<SeatDrag | null>(null);

/**
 * Drag-and-drop seating, shared between the two team panels and the spectator
 * bench so there is exactly one drop target per seat.
 *
 * Dragging is the primary interaction, but a held card can also be placed by
 * tapping a zone: HTML5 drag-and-drop does nothing on touch screens or with a
 * keyboard, and the lobby has to work there too.
 */
export function SeatDragProvider({
  children,
  isHost,
  youId,
  seatOf,
  onAssign,
  enabled,
}: {
  children: ReactNode;
  isHost: boolean;
  youId: string;
  /** Where a player currently sits, so a no-op drop can be ignored. */
  seatOf: (playerId: string) => string;
  onAssign: (playerId: string, team: Team | null, role: Role | null) => void;
  /** Seating is only possible in the lobby. */
  enabled: boolean;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const mayMove = useCallback(
    (playerId: string) => enabled && (isHost || playerId === youId),
    [enabled, isHost, youId],
  );

  const place = useCallback(
    (playerId: string, key: string, team: Team | null, role: Role | null) => {
      setHeld(null);
      setOver(null);
      if (!mayMove(playerId)) return;
      if (seatOf(playerId) === key) return; // already there
      onAssign(playerId, team, role);
    },
    [mayMove, onAssign, seatOf],
  );

  const value = useMemo<SeatDrag>(
    () => ({
      enabled,
      held,
      over,
      mayMove,
      cardProps: (playerId) => {
        if (!mayMove(playerId)) return {};
        return {
          draggable: true,
          'aria-grabbed': held === playerId,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData('text/plain', playerId);
            e.dataTransfer.effectAllowed = 'move';
            setHeld(playerId);
          },
          onDragEnd: () => {
            setHeld(null);
            setOver(null);
          },
          onClick: (e: React.MouseEvent) => {
            // A card sits inside a zone, so mark the event as handled here and
            // let the zone below skip it. stopPropagation is not enough: React
            // listens at the root, so the zone's handler runs regardless.
            (e.nativeEvent as CardClick).seatCardHandled = true;
            setHeld((cur) => (cur === playerId ? null : playerId));
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') setHeld(null);
          },
        };
      },
      zoneProps: (key, team, role) => {
        if (!enabled) return {};
        return {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          },
          onDragEnter: () => setOver(key),
          onDragLeave: (e: React.DragEvent) => {
            // Moving onto a child is not leaving the zone.
            if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(null);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain') || held;
            if (id) place(id, key, team, role);
          },
          onClick: (e: React.MouseEvent) => {
            // Picking a card up must not immediately drop it where it already is.
            if ((e.nativeEvent as CardClick).seatCardHandled) return;
            if (held) place(held, key, team, role);
          },
        };
      },
    }),
    [enabled, held, mayMove, over, place],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside the lobby, where seats cannot change. */
export function useSeatDrag(): SeatDrag | null {
  return useContext(Ctx);
}

export const seatKey = (p: { team: Team | null; role: Role | null }) =>
  p.team && p.role ? `${p.team}:${p.role}` : 'spectators';
