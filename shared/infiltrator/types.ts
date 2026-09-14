import type { BasePlayer, RoomView } from '../room.js';

export type InfiltratorPhase = 'lobby' | 'playing' | 'voting' | 'ended';

export interface InfiltratorSettings {
  roundSeconds: number;
}

export const DEFAULT_ROUND_SECONDS = 8 * 60;
export const MIN_ROUND_SECONDS = 60;
export const MAX_ROUND_SECONDS = 20 * 60;
export const MIN_PLAYERS = 3;

/** An in-progress accusation. The accuser has implicitly voted yes. */
export interface Accusation {
  accuserId: string;
  accusedId: string;
  votes: Record<string, boolean>;
}

export type RoundReason =
  | 'caught' // unanimous (or final) vote correctly picked the spy
  | 'wrongAccusation' // unanimous vote convicted an innocent player
  | 'spyGuessedRight'
  | 'spyGuessedWrong'
  | 'timeUp' // time ran out and the final vote did not find the spy
  | 'spyLeft'; // the spy left the room

export interface RoundResult {
  winner: 'spy' | 'agents';
  reason: RoundReason;
  accusedId?: string;
  accuserId?: string;
  guessedLocation?: string;
}

export interface InfiltratorRound {
  number: number;
  location: string;
  spyId: string;
  /** Role per non-spy participant. */
  roles: Record<string, string>;
  participantIds: string[];
  /** Wall-clock (server ms) when time runs out, ignoring pauses. */
  endsAt: number;
  /** Set while an accusation is being voted on; the clock is frozen. */
  pausedAt: number | null;
  accusation: Accusation | null;
  /** Players who have already used their one accusation this round. */
  accusedBy: string[];
  /** After time runs out: each participant's vote for who the spy is. */
  finalVotes: Record<string, string>;
  result: RoundResult | null;
}

export interface InfiltratorState {
  phase: InfiltratorPhase;
  settings: InfiltratorSettings;
  round: InfiltratorRound | null;
  scores: Record<string, number>;
  roundsPlayed: number;
}

/** What one player is allowed to see of the round. */
export interface InfiltratorRoundView extends Omit<InfiltratorRound, 'location' | 'spyId' | 'roles'> {
  isSpy: boolean;
  /** Your role, or null for the spy. */
  role: string | null;
  /** The location, hidden from the spy until the round ends. */
  location: string | null;
  /** Revealed to everyone when the round ends. */
  spyId: string | null;
  roles: Record<string, string> | null;
}

export interface InfiltratorView {
  phase: InfiltratorPhase;
  settings: InfiltratorSettings;
  round: InfiltratorRoundView | null;
  scores: Record<string, number>;
  roundsPlayed: number;
  /** All possible locations, for the spy's guess and everyone's reference. */
  locations: string[];
  /** Server clock at send time, so clients can correct their countdown. */
  serverNow: number;
}

export type InfiltratorPlayer = BasePlayer;
export type InfiltratorRoomView = RoomView<InfiltratorPlayer, InfiltratorView>;
