import type { AckFn } from '../protocol.js';

/** Socket events for Spectrum. Every key is prefixed with 'spectrum:'. */
export interface SpectrumEvents {
  /** Host, lobby only: rounds and/or game mode. */
  'spectrum:settings': (payload: { rounds?: number; mode?: string }, ack?: AckFn) => void;
  /** Host, lobby only, team mode: put a player on a side (null benches them). */
  'spectrum:team': (payload: { playerId: string; team: string | null }, ack?: AckFn) => void;
  /** Host, lobby only, team mode: split everyone at random. */
  'spectrum:shuffleTeams': (ack?: AckFn) => void;
  /** Host, lobby only. */
  'spectrum:start': (ack?: AckFn) => void;
  /** Psychic, clue phase. */
  'spectrum:clue': (payload: { text: string }, ack?: AckFn) => void;
  /** Guesser, guessing phase: move the needle (0-100). */
  'spectrum:guess': (payload: { value: number }, ack?: AckFn) => void;
  /** Guesser, guessing phase: lock the current guess. */
  'spectrum:lock': (ack?: AckFn) => void;
  /** Host, reveal phase: next round (or end the game after the last). */
  'spectrum:next': (ack?: AckFn) => void;
  /** Host: back to the lobby, scores wiped. */
  'spectrum:reset': (ack?: AckFn) => void;
}
