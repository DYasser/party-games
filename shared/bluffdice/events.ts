import type { AckFn } from '../protocol.js';

/** Socket events for Bluff Dice. Every key is prefixed with 'bluffdice:'. */
export interface BluffDiceEvents {
  'bluffdice:settings': (payload: { dicePerPlayer: number; onesWild: boolean }, ack?: AckFn) => void;
  'bluffdice:start': (ack?: AckFn) => void;
  'bluffdice:bid': (payload: { quantity: number; face: number }, ack?: AckFn) => void;
  'bluffdice:challenge': (ack?: AckFn) => void;
  /** Host only: skip the rest of the reveal countdown. */
  'bluffdice:next': (ack?: AckFn) => void;
  /** Host only: back to the lobby (settings kept). */
  'bluffdice:reset': (ack?: AckFn) => void;
}
