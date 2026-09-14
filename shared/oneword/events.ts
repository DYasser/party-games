import type { AckFn } from '../protocol.js';

/** Socket events for One Word. Every key is prefixed with 'oneword:'. */
export interface OneWordEvents {
  /** Host only: deal a fresh 13-card deck to everyone connected. */
  'oneword:start': (ack?: AckFn) => void;
  /** Hinter: submit (or replace) your one-word hint for the current card. */
  'oneword:hint': (payload: { text: string }, ack?: AckFn) => void;
  /** Hinter, review phase: toggle-cancel the hint written by `playerId`. */
  'oneword:cancel': (payload: { playerId: string }, ack?: AckFn) => void;
  /** Hinter, review phase: "Show hints to guesser". */
  'oneword:ready': (ack?: AckFn) => void;
  /** Guesser: guess the secret word. */
  'oneword:guess': (payload: { text: string }, ack?: AckFn) => void;
  /** Guesser: give up on this card. */
  'oneword:pass': (ack?: AckFn) => void;
  /** Host only: skip the result countdown and move to the next card. */
  'oneword:next': (ack?: AckFn) => void;
  /** Host only: back to the lobby. */
  'oneword:reset': (ack?: AckFn) => void;
}
