import type { BasePlayer, RoomView } from '../room.js';
import type { Spectrum } from './spectra.js';

export type SpectrumPhase = 'lobby' | 'clue' | 'guessing' | 'reveal' | 'ended';

export interface SpectrumSettings {
  /** Number of rounds in a game. */
  rounds: number;
}

export const DEFAULT_ROUNDS = 8;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 20;
export const MIN_PLAYERS = 3;
/** Seconds guessers get once the clue is given. */
export const GUESS_SECONDS = 60;
/** Seconds the reveal stays up before the next round starts on its own. */
export const REVEAL_SECONDS = 12;
export const MAX_CLUE_LENGTH = 40;
export const MAX_POINTS = 5;

export interface Guess {
  value: number;
  locked: boolean;
}

export interface SpectrumRound {
  number: number;
  psychicId: string;
  spectrum: Spectrum;
  /** Secret position 0-100. Only the psychic sees it before the reveal. */
  target: number;
  clue: string | null;
  /** Everyone in the round except the psychic. */
  guesserIds: string[];
  guesses: Record<string, Guess>;
  /** Server ms when guessing closes; set when the clue arrives. */
  guessEndsAt: number | null;
  /** Server ms when the reveal auto-advances. */
  revealEndsAt: number | null;
  /** Points each guesser earned this round (set at reveal). */
  points: Record<string, number> | null;
  psychicPoints: number | null;
}

export interface SpectrumState {
  phase: SpectrumPhase;
  settings: SpectrumSettings;
  round: SpectrumRound | null;
  /** Cumulative score per player id. */
  scores: Record<string, number>;
  roundsPlayed: number;
  /** Indices into SPECTRA already used this game, so pairs do not repeat. */
  usedSpectra: number[];
}

export interface GuessView {
  /** Hidden from other guessers until the reveal. */
  value: number | null;
  locked: boolean;
}

export interface SpectrumRoundView extends Omit<SpectrumRound, 'target' | 'guesses'> {
  isPsychic: boolean;
  /** Visible to the psychic, and to everyone at the reveal. */
  target: number | null;
  guesses: Record<string, GuessView>;
}

export interface SpectrumView {
  phase: SpectrumPhase;
  settings: SpectrumSettings;
  round: SpectrumRoundView | null;
  scores: Record<string, number>;
  roundsPlayed: number;
  /** Server clock at send time, so clients can correct their countdown. */
  serverNow: number;
}

export type SpectrumPlayer = BasePlayer;
export type SpectrumRoomView = RoomView<SpectrumPlayer, SpectrumView>;
