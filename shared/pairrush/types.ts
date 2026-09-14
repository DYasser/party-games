import type { BasePlayer } from '../room.js';

/** Board sizes the host can choose. Always even, so every card has a partner. */
export const BOARD_SIZES = [4, 6, 8, 10] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
export const DEFAULT_SIZE: BoardSize = 6;

export function isBoardSize(n: unknown): n is BoardSize {
  return typeof n === 'number' && (BOARD_SIZES as readonly number[]).includes(n);
}

/** How long a mismatched pair stays face-up before flipping back. */
export const PEEK_MS = 900;

export const MIN_ROUND_SECONDS = 60;
export const MAX_ROUND_SECONDS = 900;
export const DEFAULT_ROUND_SECONDS = 300;

export interface PairRushSettings {
  size: BoardSize;
  /** The whole race is abandoned if nobody finishes in this long. */
  roundSeconds: number;
}

export function defaultSettings(): PairRushSettings {
  return { size: DEFAULT_SIZE, roundSeconds: DEFAULT_ROUND_SECONDS };
}

export interface PairRushPlayer extends BasePlayer {}

/**
 * One player's board.
 *
 * Everyone races the same deal, so `deck` lives on the game state and only the
 * per-player progress lives here.
 */
export interface PlayerBoard {
  /** Indices of cards whose pair has been found; these stay face-up. */
  matched: number[];
  /** The 0, 1 or 2 cards this player currently has face-up. */
  flipped: number[];
  /**
   * Set when two cards are face-up and do not match. Until this passes, the
   * player cannot flip anything: it is the beat where you memorise the miss.
   */
  peekUntil: number | null;
  /** How many times this player has turned over a second card. */
  attempts: number;
  /** Finish position, 1-based; null while still solving. */
  finishOrder: number | null;
  finishedAt: number | null;
}

export interface PairRushState {
  phase: 'lobby' | 'playing' | 'ended';
  settings: PairRushSettings;
  /**
   * The deal: `deck[i]` is the symbol on card i. Identical for every player,
   * which is what makes the race fair. Never sent to a client wholesale — see
   * `viewFor`.
   */
  deck: string[];
  boards: Record<string, PlayerBoard>;
  startedAt: number | null;
  endsAt: number | null;
  /** Everyone who has cleared their board, in finishing order. */
  finished: string[];
}

/** A card as one player is allowed to see it. */
export interface CardView {
  /** The symbol, but only once this player has earned the right to see it. */
  symbol: string | null;
  matched: boolean;
  flipped: boolean;
}

/** What one opponent looks like from the outside: progress, never positions. */
export interface RivalView {
  id: string;
  name: string;
  isBot?: boolean;
  connected: boolean;
  pairsFound: number;
  attempts: number;
  finishOrder: number | null;
  /** Milliseconds from the start of the race to clearing the board. */
  finishMs: number | null;
}

export interface PairRushView {
  phase: PairRushState['phase'];
  settings: PairRushSettings;
  size: BoardSize;
  /** Your own board, with only your own face-up cards revealed. */
  cards: CardView[];
  pairsTotal: number;
  pairsFound: number;
  attempts: number;
  /** Locked while a mismatched pair is still showing. */
  peekUntil: number | null;
  finishOrder: number | null;
  /** Your own time to clear the board, in milliseconds. */
  finishMs: number | null;
  rivals: RivalView[];
  startedAt: number | null;
  endsAt: number | null;
  serverNow: number;
}
