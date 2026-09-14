import type { AckFn } from '../protocol.js';

/** Socket events for Nightfall. Every key is prefixed with 'nightfall:'. */
export interface NightfallEvents {
  /** Host only: change the day discussion length (60-600s). */
  'nightfall:settings': (
    payload: {
      nightSeconds?: number;
      voteLockSeconds?: number;
      daySeconds?: number;
      hostCanCallVote?: boolean;
    },
    ack?: AckFn,
  ) => void;
  /** Host only: deal roles to every connected player and begin the first night. */
  'nightfall:start': (ack?: AckFn) => void;
  /** Submit or change your night action (Shade kill, Oracle inspect, Healer protect). */
  /** Choose a target for tonight. Provisional: changeable until you are ready. */
  'nightfall:nightAction': (payload: { targetId: string }, ack?: AckFn) => void;
  /** Lock tonight's choice in. The night resolves once every actor is ready. */
  'nightfall:nightReady': (ack?: AckFn) => void;
  /** Cast or change your daytime vote; null means "skip". */
  'nightfall:vote': (payload: { targetId: string | null }, ack?: AckFn) => void;
  /** Host only: resolve the day with the votes cast so far. */
  'nightfall:callVote': (ack?: AckFn) => void;
  /** Host only: back to the lobby. */
  'nightfall:reset': (ack?: AckFn) => void;
}
