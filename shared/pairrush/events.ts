import type { AckFn } from '../protocol.js';

/** Socket events for Pair Rush. Every key is prefixed with 'pairrush:'. */
export interface PairRushEvents {
  /** Host only, in the lobby: board size and the overall time limit. */
  'pairrush:settings': (payload: { size?: number; roundSeconds?: number }, ack?: AckFn) => void;
  /** Host only: deal one board and start everyone racing on it. */
  'pairrush:start': (ack?: AckFn) => void;
  /** Turn over the card at `index` on your own board. */
  'pairrush:flip': (payload: { index: number }, ack?: AckFn) => void;
  /** Host only: back to the lobby. */
  'pairrush:reset': (ack?: AckFn) => void;
}
