import type { BasePlayer, RoomView } from '../room.js';
import type { Spectrum } from './spectra.js';

export type SpectrumPhase = 'lobby' | 'clue' | 'guessing' | 'reveal' | 'ended';

/**
 * How a game is played.
 *
 * - `classic`  the spectrum's two ends are named, everyone guesses, and each
 *              player scores for themselves.
 * - `blind`    the same, but the ends are never shown. The clue is the only
 *              information anyone has, which is much harder.
 * - `teams`    two teams take turns. Only the psychic's own team guesses, and
 *              their points go to the team.
 */
export type SpectrumMode = 'classic' | 'blind' | 'teams';

export const MODES: readonly SpectrumMode[] = ['classic', 'blind', 'teams'];

export function isMode(v: unknown): v is SpectrumMode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v);
}

export type SpectrumTeam = 'red' | 'blue';

export interface SpectrumSettings {
  /** Number of rounds in a game. */
  rounds: number;
  mode: SpectrumMode;
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
/** Team mode needs one psychic and one guesser on each side. */
export const MIN_TEAM_PLAYERS = 4;

export interface Guess {
  value: number;
  locked: boolean;
}

export interface SpectrumRound {
  number: number;
  psychicId: string;
  /** Team mode only: whose turn it is, and who therefore scores. */
  team: SpectrumTeam | null;
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
  /** Team mode only: which side each player is on, set in the lobby. */
  teams: Record<string, SpectrumTeam>;
  /** Team mode only: cumulative score per team. */
  teamScores: Record<SpectrumTeam, number>;
}

export interface GuessView {
  /** Hidden from other guessers until the reveal. */
  value: number | null;
  locked: boolean;
}

export interface SpectrumRoundView extends Omit<SpectrumRound, 'target' | 'guesses' | 'spectrum'> {
  isPsychic: boolean;
  /**
   * The two ends of the scale. Null in blind mode, where nobody — not even the
   * psychic — is told what the extremes are.
   */
  spectrum: Spectrum | null;
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
  teams: Record<string, SpectrumTeam>;
  teamScores: Record<SpectrumTeam, number>;
  /** Server clock at send time, so clients can correct their countdown. */
  serverNow: number;
}

export type SpectrumPlayer = BasePlayer;
export type SpectrumRoomView = RoomView<SpectrumPlayer, SpectrumView>;
