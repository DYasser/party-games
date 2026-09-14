import type { BasePlayer, GameId, Room } from '../../shared/room.js';

export type AnyRoom = Room<BasePlayer, unknown>;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
const CODE_LENGTH = 4;
/** How long a disconnected player keeps their seat before being dropped. */
const PLAYER_GRACE_MS = 2 * 60 * 1000;
/** How long an empty room lingers before deletion. */
const ROOM_GRACE_MS = 10 * 60 * 1000;

export interface RoomListeners {
  onRoomChanged(room: AnyRoom): void;
  onPlayerRemoved(room: AnyRoom, playerId: string): void;
  onRoomClosed(room: AnyRoom): void;
}

/** Game-agnostic room bookkeeping: codes, seats, reconnect grace periods, cleanup. */
export class RoomManager {
  private rooms = new Map<string, AnyRoom>();
  private playerTimers = new Map<string, NodeJS.Timeout>();
  private roomTimers = new Map<string, NodeJS.Timeout>();
  private listeners: RoomListeners = {
    onRoomChanged: () => {},
    onPlayerRemoved: () => {},
    onRoomClosed: () => {},
  };

  setListeners(listeners: RoomListeners): void {
    this.listeners = listeners;
  }

  get(code: string): AnyRoom | undefined {
    return this.rooms.get(normalizeCode(code));
  }

  create(game: GameId, host: BasePlayer, state: unknown, maxPlayers: number): AnyRoom {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room: AnyRoom & { maxPlayers: number } = {
      code,
      game,
      hostId: host.id,
      players: [host],
      state,
      createdAt: Date.now(),
      maxPlayers,
    };
    this.rooms.set(code, room);
    return room;
  }

  /** Seat a player, or reconnect them if they already have a seat. */
  join(room: AnyRoom, player: BasePlayer): AnyRoom | { error: string } {
    this.cancelRoomTimer(room.code);

    const existing = room.players.find((p) => p.id === player.id);
    if (existing) {
      existing.connected = true;
      if (player.name) existing.name = player.name;
      this.cancelPlayerTimer(player.id);
      return room;
    }
    const max = (room as { maxPlayers?: number }).maxPlayers ?? 20;
    if (room.players.length >= max) return { error: 'This room is full.' };
    room.players.push(player);
    return room;
  }

  /** Mark a player disconnected; drop them after a grace period unless they return. */
  disconnect(code: string, playerId: string): void {
    const room = this.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = false;
    this.listeners.onRoomChanged(room);

    this.cancelPlayerTimer(playerId);
    this.playerTimers.set(
      playerId,
      setTimeout(() => {
        this.playerTimers.delete(playerId);
        this.remove(code, playerId);
      }, PLAYER_GRACE_MS),
    );
  }

  /** Remove a player from a room immediately. */
  remove(code: string, playerId: string): void {
    const room = this.get(code);
    if (!room) return;
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    room.players.splice(idx, 1);
    this.cancelPlayerTimer(playerId);

    if (room.players.length === 0) {
      this.scheduleRoomClose(room.code);
      return;
    }
    if (room.hostId === playerId) {
      const next = room.players.find((p) => p.connected) ?? room.players[0];
      room.hostId = next.id;
    }
    this.listeners.onPlayerRemoved(room, playerId);
    this.listeners.onRoomChanged(room);
  }

  private scheduleRoomClose(code: string): void {
    this.cancelRoomTimer(code);
    this.roomTimers.set(
      code,
      setTimeout(() => {
        this.roomTimers.delete(code);
        const room = this.rooms.get(code);
        if (room && room.players.length === 0) {
          this.rooms.delete(code);
          this.listeners.onRoomClosed(room);
        }
      }, ROOM_GRACE_MS),
    );
  }

  private cancelPlayerTimer(playerId: string): void {
    const t = this.playerTimers.get(playerId);
    if (t) clearTimeout(t);
    this.playerTimers.delete(playerId);
  }

  private cancelRoomTimer(code: string): void {
    const t = this.roomTimers.get(code);
    if (t) clearTimeout(t);
    this.roomTimers.delete(code);
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
