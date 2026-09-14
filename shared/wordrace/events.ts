import type { Ack, AckFn } from '../protocol.js';
import type { LanguageCode } from './languages.js';

/** Result of asking the server to check a pasted custom word list. */
export interface CustomListCheck {
  accepted: string[];
  rejected: { word: string; reason: string }[];
  /** Accepted words that are not in the language dictionary, for a warning. */
  notInDictionary: string[];
}

/** Socket events for Word Race. Every key is prefixed with 'wordrace:'. */
export interface WordRaceEvents {
  /**
   * Host only, lobby/ended: change round count, round length, language, or the
   * custom answer list. `customWords` is raw pasted text; an empty string
   * clears the list and returns to the language's own answers.
   */
  'wordrace:settings': (
    payload: { rounds?: number; roundSeconds?: number; language?: LanguageCode; customWords?: string },
    ack?: AckFn,
  ) => void;
  /** Preview a pasted list without applying it, so the host sees what will be kept. */
  'wordrace:checkList': (
    payload: { text: string; language?: LanguageCode },
    ack: (res: Ack<CustomListCheck>) => void,
  ) => void;
  /** Host only: start a new game (from lobby or ended). */
  'wordrace:start': (ack?: AckFn) => void;
  /** Submit a five-letter guess for the current round. */
  'wordrace:guess': (payload: { word: string }, ack?: AckFn) => void;
  /** Host only, during reveal: skip the reveal countdown. */
  'wordrace:next': (ack?: AckFn) => void;
  /** Host only: back to the lobby, wiping scores. */
  'wordrace:reset': (ack?: AckFn) => void;
}
