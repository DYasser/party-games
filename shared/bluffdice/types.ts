import type { BasePlayer, RoomView } from '../room.js';

export type BluffDicePhase = 'lobby' | 'bidding' | 'reveal' | 'ended';

export interface BluffDiceSettings {
  /** Dice each player starts with. */
  dicePerPlayer: number;
  /** When true, a rolled 1 counts as any face and bids on face 1 are not allowed. */
  onesWild: boolean;
}

export const MIN_PLAYERS = 2;
export const DEFAULT_DICE_PER_PLAYER = 5;
export const MIN_DICE_PER_PLAYER = 3;
export const MAX_DICE_PER_PLAYER = 6;
export const TURN_SECONDS = 45;
export const REVEAL_MS = 6000;
export const FACES = [1, 2, 3, 4, 5, 6] as const;

export interface Bid {
  quantity: number;
  face: number;
  bidderId: string;
}

export interface BluffDiceParticipant {
  id: string;
  diceCount: number;
  /** Current roll. Length equals diceCount except during the reveal, when the just-lost die is still shown. */
  dice: number[];
  /** Forfeited by leaving the room mid-game. */
  left: boolean;
}

export interface RevealResult {
  bid: Bid;
  challengerId: string;
  /** Dice matching the bid face (plus wild 1s). */
  actual: number;
  /** True when actual >= quantity, i.e. the challenger was wrong. */
  bidStood: boolean;
  /** Who lost a die; null when the loser had already left. */
  loserId: string | null;
  /** Set when the loser dropped to zero dice. */
  eliminatedId: string | null;
}

export interface BluffDiceState {
  phase: BluffDicePhase;
  settings: BluffDiceSettings;
  /** Participant ids in seat order, fixed at game start. */
  seatOrder: string[];
  players: Record<string, BluffDiceParticipant>;
  round: number;
  currentPlayerId: string | null;
  bid: Bid | null;
  /** Server ms when the current turn auto-resolves. */
  turnEndsAt: number | null;
  /** Server ms when the reveal auto-continues. */
  revealEndsAt: number | null;
  lastResult: RevealResult | null;
  /** Ids in the order they ran out of dice (first out first). */
  eliminationOrder: string[];
  winnerId: string | null;
}

export interface BluffDiceParticipantView extends Omit<BluffDiceParticipant, 'dice'> {
  /** Null when this viewer may not see those dice. */
  dice: number[] | null;
}

export interface BluffDiceView {
  phase: BluffDicePhase;
  settings: BluffDiceSettings;
  seatOrder: string[];
  players: Record<string, BluffDiceParticipantView>;
  round: number;
  currentPlayerId: string | null;
  bid: Bid | null;
  turnEndsAt: number | null;
  revealEndsAt: number | null;
  lastResult: RevealResult | null;
  eliminationOrder: string[];
  winnerId: string | null;
  totalDice: number;
  serverNow: number;
}

export type BluffDicePlayer = BasePlayer;
export type BluffDiceRoomView = RoomView<BluffDicePlayer, BluffDiceView>;
