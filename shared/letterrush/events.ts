import type { AckFn } from '../protocol.js';

/** Socket events for Letter Rush. Every key is prefixed with 'letterrush:'. */
export interface LetterRushEvents {
  /** Host, lobby only. */
  'letterrush:settings': (payload: { rounds: number; roundSeconds: number }, ack?: AckFn) => void;
  /** Host: deal round 1. */
  'letterrush:start': (ack?: AckFn) => void;
  /** Upsert one answer while writing. */
  'letterrush:answer': (payload: { categoryIndex: number; text: string }, ack?: AckFn) => void;
  /** "Done" (writing) or "Done reviewing" (review), depending on the phase. */
  'letterrush:done': (ack?: AckFn) => void;
  /** Toggle your flag on another player's answer. */
  'letterrush:flag': (payload: { categoryIndex: number; playerId: string }, ack?: AckFn) => void;
  /** Host: commit scores now. */
  'letterrush:finishReview': (ack?: AckFn) => void;
  /** Host: leave the round summary early. */
  'letterrush:next': (ack?: AckFn) => void;
  /** Host: back to the lobby. */
  'letterrush:reset': (ack?: AckFn) => void;
}
