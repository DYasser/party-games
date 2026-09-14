import type { BasePlayer, RoomView } from '../room.js';

export type OneWordPhase = 'lobby' | 'hinting' | 'review' | 'guessing' | 'result' | 'ended';

export const MIN_PLAYERS = 3;
export const DECK_SIZE = 13;
export const HINT_SECONDS = 45;
export const REVIEW_SECONDS = 30;
export const GUESS_SECONDS = 60;
export const RESULT_SECONDS = 6;
export const MAX_HINT_LENGTH = 20;

/** What happened to a card in the deck. */
export type CardOutcome =
  | 'success' // guessed correctly (+1)
  | 'fail' // wrong guess (also discards the next card)
  | 'pass' // the guesser gave up
  | 'discarded'; // burned by a wrong guess on the previous card, or lost to a leaver

export interface Hint {
  playerId: string;
  text: string;
  /** Hidden from the guesser. */
  cancelled: boolean;
  /** Cancelled automatically because another hinter wrote the same thing. */
  duplicate: boolean;
}

export interface OneWordCard {
  /** Position in the deck, 0-based. */
  index: number;
  word: string;
  guesserId: string;
  /** Everyone else who was seated when the card started. */
  hinterIds: string[];
  hints: Record<string, Hint>;
  /** Hinters who pressed "Show hints to guesser". */
  ready: string[];
  guess: string | null;
  outcome: CardOutcome | null;
}

export interface OneWordState {
  phase: OneWordPhase;
  /** The 13 secret words in deck order. */
  deck: string[];
  /** Outcome per deck position; null while the card is still to come. */
  outcomes: (CardOutcome | null)[];
  participantIds: string[];
  /** Index into participantIds of the current guesser. */
  guesserCursor: number;
  card: OneWordCard | null;
  score: number;
  /** Server ms when the current phase auto-advances, or null. */
  phaseEndsAt: number | null;
  gamesPlayed: number;
}

/** A hint as one player is allowed to see it. */
export interface HintView {
  playerId: string;
  text: string;
  cancelled: boolean;
  duplicate: boolean;
}

export interface OneWordCardView {
  index: number;
  /** Hidden from the guesser until the result phase. */
  word: string | null;
  guesserId: string;
  hinterIds: string[];
  /** Who has submitted a hint (names only, no text) during hinting. */
  submittedIds: string[];
  /** Your own hint text while hinting, so the input can show it. */
  yourHint: string | null;
  /**
   * Hints visible to you: null while hinting; every hint for hinters in review and after;
   * only surviving hints for the guesser while guessing; everything for everyone on result.
   */
  hints: HintView[] | null;
  ready: string[];
  guess: string | null;
  outcome: CardOutcome | null;
}

export interface OneWordView {
  phase: OneWordPhase;
  deckSize: number;
  outcomes: (CardOutcome | null)[];
  participantIds: string[];
  card: OneWordCardView | null;
  score: number;
  phaseEndsAt: number | null;
  gamesPlayed: number;
  /** Set once the game has ended. */
  rating: string | null;
  serverNow: number;
}

export type OneWordPlayer = BasePlayer;
export type OneWordRoomView = RoomView<OneWordPlayer, OneWordView>;
