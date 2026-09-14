import type { BasePlayer, RoomView } from '../room.js';
import type { LanguageCode } from './languages.js';

export type WordRacePhase = 'lobby' | 'playing' | 'reveal' | 'ended';

/** Per-letter feedback: g = right letter right spot, y = in the word elsewhere, x = absent. */
export type Mark = 'g' | 'y' | 'x';

export type BoardStatus = 'solving' | 'solved' | 'failed';

export interface WordRaceSettings {
  rounds: number;
  roundSeconds: number;
  /** Fixed at MAX_GUESSES; kept in settings so the client never hard-codes it. */
  maxGuesses: number;
  /** Which dictionary validates guesses and supplies answers. */
  language: LanguageCode;
  /**
   * Host-supplied answers. When non-empty these replace the language's answer
   * pool; guesses are still validated against the full dictionary plus these.
   */
  customWords: string[];
}

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
export const DEFAULT_ROUNDS = 3;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;
export const DEFAULT_ROUND_SECONDS = 180;
export const MIN_ROUND_SECONDS = 60;
export const MAX_ROUND_SECONDS = 600;
export const REVEAL_MS = 8000;
export const MIN_PLAYERS = 1;
/** Speed bonus for the first, second and third solver of a round. */
export const SPEED_BONUS = [15, 10, 5];

export interface Guess {
  word: string;
  marks: Mark[];
}

export interface PlayerBoard {
  guesses: Guess[];
  status: BoardStatus;
  /** 1-based order among solvers, or null until solved. */
  finishOrder: number | null;
  /** Points earned this round (settled when the board is solved or failed). */
  points: number;
}

export interface WordRaceRound {
  number: number;
  answer: string;
  /** Players still counted for "everyone finished". Leavers are removed. */
  participantIds: string[];
  boards: Record<string, PlayerBoard>;
  startedAt: number;
  /** Server ms when the guessing clock runs out. */
  endsAt: number;
  /** Server ms when the reveal auto-advances; set on entering `reveal`. */
  revealEndsAt: number | null;
  /** Why the round ended, once it has. */
  endReason: 'allDone' | 'timeUp' | null;
}

export interface WordRaceState {
  phase: WordRacePhase;
  settings: WordRaceSettings;
  round: WordRaceRound | null;
  scores: Record<string, number>;
  roundsPlayed: number;
  /** Answers already used this game, so no word repeats. */
  usedAnswers: string[];
}

/** A guess as seen by another player: letters hidden until the reveal. */
export interface GuessView {
  word: string | null;
  marks: Mark[];
}

export interface PlayerBoardView {
  guesses: GuessView[];
  status: BoardStatus;
  finishOrder: number | null;
  points: number;
}

export interface WordRaceRoundView {
  number: number;
  /** Hidden until reveal/ended. */
  answer: string | null;
  participantIds: string[];
  boards: Record<string, PlayerBoardView>;
  startedAt: number;
  endsAt: number;
  revealEndsAt: number | null;
  endReason: WordRaceRound['endReason'];
}

/** Summary of the word source in play, for the lobby and the rules panel. */
export interface WordSourceView {
  language: LanguageCode;
  /** True when the host supplied their own answer list. */
  custom: boolean;
  /** How many answers the current source can draw from. */
  answerCount: number;
  /** How many words the dictionary accepts as guesses. */
  guessCount: number;
  /**
   * The answers in play. Sent only in the lobby and when custom, so nobody can
   * read the pool mid-game and narrow the secret word down.
   */
  answers: string[] | null;
}

export interface WordRaceView {
  phase: WordRacePhase;
  settings: WordRaceSettings;
  round: WordRaceRoundView | null;
  scores: Record<string, number>;
  roundsPlayed: number;
  /** Server clock at send time so clients can correct their countdown. */
  serverNow: number;
  wordSource: WordSourceView;
}

export type WordRacePlayer = BasePlayer;
export type WordRaceRoomView = RoomView<WordRacePlayer, WordRaceView>;
