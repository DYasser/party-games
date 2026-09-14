import type { BluffDiceEvents } from './bluffdice/events.js';
import type { Role, Team } from './ciphergrid/types.js';
import type { LetterRushEvents } from './letterrush/events.js';
import type { NightfallEvents } from './nightfall/events.js';
import type { OneWordEvents } from './oneword/events.js';
import type { PairRushEvents } from './pairrush/events.js';
import type { ConfettiEvent, ReactionEvent, ReactionKey } from './celebration.js';
import type { GameId, RoomView } from './room.js';
import type { SpectrumEvents } from './spectrum/events.js';
import type { WordRaceEvents } from './wordrace/events.js';

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type AckFn = (res: Ack) => void;

/** Room events shared by every game. */
export interface RoomEvents {
  'room:create': (
    payload: { game: GameId; name: string; playerId: string },
    ack: (res: Ack<{ code: string }>) => void,
  ) => void;
  'room:join': (
    payload: { code: string; name: string; playerId: string },
    ack: (res: Ack<{ code: string; game: GameId }>) => void,
  ) => void;
  'room:leave': () => void;
  'player:rename': (payload: { name: string }, ack?: AckFn) => void;
  /** Host only: add a server-controlled bot player. */
  'room:addBot': (ack?: AckFn) => void;
  /** Host only: remove every bot from the room. */
  'room:removeBots': (ack?: AckFn) => void;
  /**
   * Fling a reaction at another player on the results screen. Purely cosmetic,
   * rate-limited server-side, and never stored in game state.
   */
  'celebrate:react': (payload: { toId: string; which: ReactionKey }, ack?: AckFn) => void;
  /** Fire the confetti cannon for the whole room. */
  'celebrate:confetti': (ack?: AckFn) => void;
}

export interface CipherGridEvents {
  'team:join': (payload: { team: Team; role: Role }, ack?: AckFn) => void;
  /** Host only: seat another player, or send them back to the bench. */
  'team:assign': (
    payload: { playerId: string; team: Team | null; role: Role | null },
    ack?: AckFn,
  ) => void;
  'game:settings': (payload: { clueSeconds?: number; guessSeconds?: number }, ack?: AckFn) => void;
  'team:randomize': (ack?: AckFn) => void;
  'game:start': (ack?: AckFn) => void;
  'game:clue': (payload: { word: string; count: number }, ack?: AckFn) => void;
  'game:guess': (payload: { index: number }, ack?: AckFn) => void;
  'game:endTurn': (ack?: AckFn) => void;
  'game:reset': (ack?: AckFn) => void;
}

export interface InfiltratorEvents {
  'infiltrator:settings': (payload: { roundSeconds: number }, ack?: AckFn) => void;
  'infiltrator:start': (ack?: AckFn) => void;
  'infiltrator:accuse': (payload: { accusedId: string }, ack?: AckFn) => void;
  'infiltrator:vote': (payload: { agree: boolean }, ack?: AckFn) => void;
  'infiltrator:guess': (payload: { location: string }, ack?: AckFn) => void;
  'infiltrator:finalVote': (payload: { playerId: string }, ack?: AckFn) => void;
  'infiltrator:reveal': (ack?: AckFn) => void;
  'infiltrator:reset': (ack?: AckFn) => void;
}

/**
 * Everything the client can send. Each game contributes its own interface from
 * `shared/<game>/events.ts`; event names are prefixed with the game id.
 */
export interface ClientToServerEvents
  extends RoomEvents,
    CipherGridEvents,
    InfiltratorEvents,
    SpectrumEvents,
    OneWordEvents,
    NightfallEvents,
    LetterRushEvents,
    PairRushEvents,
    BluffDiceEvents,
    WordRaceEvents {}

/** Events the server sends to the client. */
export interface ServerToClientEvents {
  'room:state': (view: RoomView) => void;
  'room:closed': (payload: { reason: string }) => void;
  error: (payload: { message: string }) => void;
  /** Somebody threw a reaction at somebody else. */
  'celebrate:reaction': (event: ReactionEvent) => void;
  /** Somebody fired the confetti cannon. */
  'celebrate:confetti': (event: ConfettiEvent) => void;
}
