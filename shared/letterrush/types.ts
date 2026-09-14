import type { BasePlayer, RoomView } from '../room.js';

export type LetterRushPhase = 'lobby' | 'writing' | 'review' | 'scores' | 'ended';

export interface LetterRushSettings {
  rounds: number;
  roundSeconds: number;
  /** Fixed at 6. */
  categoriesPerRound: number;
}

export const MIN_PLAYERS = 2;
export const DEFAULT_ROUNDS = 3;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;
export const DEFAULT_ROUND_SECONDS = 60;
export const MIN_ROUND_SECONDS = 30;
export const MAX_ROUND_SECONDS = 180;
export const CATEGORIES_PER_ROUND = 6;
export const REVIEW_SECONDS = 45;
export const SCORES_SECONDS = 8;
export const MAX_ANSWER_LENGTH = 40;

export type AnswerStatus = 'blank' | 'dupe' | 'rejected' | 'ok';

/** One cell of the review grid, computed from answers + flags. */
export interface AnswerCell {
  text: string;
  status: AnswerStatus;
  /** Ids of active participants currently flagging this answer. */
  flaggedBy: string[];
  points: 0 | 1;
}

export interface LetterRushRound {
  number: number;
  letter: string;
  categories: string[];
  /** Everyone dealt into the round, in seating order. Stays put when people leave. */
  participantIds: string[];
  /** Participants who have since been removed; excluded from readiness and majorities. */
  leftIds: string[];
  /** Display names captured at deal time so leavers can still be shown. */
  names: Record<string, string>;
  /** playerId -> one answer per category ('' = blank / invalid). */
  answers: Record<string, string[]>;
  /** Per category: authorId -> flagger ids. */
  flags: Record<string, string[]>[];
  doneWriting: string[];
  doneReviewing: string[];
  /** Server clock when the current phase (writing / review / scores) auto-advances. */
  endsAt: number;
  /** Committed when review finishes. */
  roundPoints: Record<string, number> | null;
}

export interface LetterRushState {
  phase: LetterRushPhase;
  settings: LetterRushSettings;
  round: LetterRushRound | null;
  scores: Record<string, number>;
  roundsPlayed: number;
  /** Category names already used this game (no repeats). */
  usedCategories: string[];
}

export interface LetterRushRoundView extends Omit<LetterRushRound, 'answers'> {
  /** During writing you only see your own answers; afterwards everyone's. */
  answers: Record<string, string[]>;
  /** Present from the review phase onwards: the full graded grid. */
  cells: Record<string, AnswerCell>[] | null;
  /** Provisional (review) or committed (scores) points this round. */
  points: Record<string, number> | null;
  /** Who is still active (participants minus leavers). */
  activeIds: string[];
}

export interface LetterRushView {
  phase: LetterRushPhase;
  settings: LetterRushSettings;
  round: LetterRushRoundView | null;
  scores: Record<string, number>;
  roundsPlayed: number;
  serverNow: number;
}

export type LetterRushPlayer = BasePlayer;
export type LetterRushRoomView = RoomView<LetterRushPlayer, LetterRushView>;
