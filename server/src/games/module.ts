import type { Socket } from 'socket.io';
import type { AckFn, ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol.js';
import type { BasePlayer, GameId, Room } from '../../../shared/room.js';

export type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Helpers handed to a game module when it registers socket handlers. */
export interface GameContext<P extends BasePlayer, S> {
  /**
   * Run an action against the socket's current room and seat. Sends the ack,
   * turns UserErrors into ack errors, and broadcasts the room on success.
   */
  withRoom(ack: AckFn | undefined, fn: (room: Room<P, S>, player: P) => void): void;
  requireHost(room: Room<P, S>, player: P): void;
  broadcast(room: Room<P, S>): void;
}

/** What a module gets when reacting to room changes outside a socket request. */
export interface RoomHooks<P extends BasePlayer, S> {
  broadcast(room: Room<P, S>): void;
}

/** Everything the socket core needs to know about one game. */
export interface GameModule<P extends BasePlayer = BasePlayer, S = unknown> {
  id: GameId;
  maxPlayers: number;
  createPlayer(base: BasePlayer): P;
  initialState(): S;
  /** Per-player projection of the room; this is what gets sent over the wire. */
  view(room: Room<P, S>, player: P): unknown;
  /** Attach the game's socket event handlers for one connection. */
  register(socket: Sock, ctx: GameContext<P, S>): void;
  /** A seated player left for good (explicit leave or grace period expired). */
  onPlayerRemoved?(room: Room<P, S>, playerId: string, hooks: RoomHooks<P, S>): void;
  /** The host added a bot; seat it sensibly (team, role, ...). */
  onBotAdded?(room: Room<P, S>, bot: P): void;
  /**
   * Called after every broadcast. Look at the room and, if any bot has something
   * to do, schedule it. Must be idempotent: it runs often.
   */
  botTick?(room: Room<P, S>, hooks: RoomHooks<P, S>): void;
  /** The room was deleted; release any timers. */
  onRoomClosed?(room: Room<P, S>): void;
}
