import type { BasePlayer, RoomView } from '../room.js';

export type NightfallPhase = 'lobby' | 'night' | 'day' | 'ended';
export type Role = 'shade' | 'oracle' | 'healer' | 'townsfolk';
export type Team = 'shades' | 'town';

export interface NightfallSettings {
  /** How long each waking role gets, in seconds. */
  nightSeconds: number;
  /** Discussion lock at the start of the day before voting opens. */
  voteLockSeconds: number;
  /** How long the day lasts, in seconds. */
  daySeconds: number;
  /** Whether the host may end the discussion early with "Call the vote". */
  hostCanCallVote: boolean;
}

export const DEFAULT_DAY_SECONDS = 180;
export const MIN_DAY_SECONDS = 60;
export const MAX_DAY_SECONDS = 600;
/**
 * Default for how long EACH waking role gets. Roles act one after another, so a
 * night with Shades, an Oracle and a Healer runs up to three of these back to
 * back. Per role, not per night: one slow Shade must never eat the Oracle's time.
 */
export const NIGHT_SECONDS = 60;
export const MIN_NIGHT_SECONDS = 15;
export const MAX_NIGHT_SECONDS = 180;
/**
 * Default discussion lock at the start of the day, before voting opens. Stops
 * the first person to click from deciding the day before anyone has spoken.
 */
export const VOTE_LOCK_SECONDS = 10;
export const MIN_VOTE_LOCK_SECONDS = 0;
/**
 * The discussion lock can never eat the whole day: voting must still be open
 * for a usable stretch afterwards. This is the share of the day it may occupy.
 */
export const MAX_VOTE_LOCK_RATIO = 0.5;
/** At least this much of the day is always left for actually voting. */
export const MIN_VOTING_SECONDS = 20;

/**
 * The largest discussion lock that fits inside a day of `daySeconds`.
 *
 * Half the day at most, and never so long that fewer than MIN_VOTING_SECONDS
 * remain — otherwise the host can configure a day where voting opens too late
 * to matter, or never opens at all.
 */
export function maxVoteLockFor(daySeconds: number): number {
  const byRatio = Math.floor(daySeconds * MAX_VOTE_LOCK_RATIO);
  const byRemainder = daySeconds - MIN_VOTING_SECONDS;
  return Math.max(MIN_VOTE_LOCK_SECONDS, Math.min(byRatio, byRemainder));
}
/** The order roles wake in. Shades first, then the Town's powers. */
export const NIGHT_ORDER: Role[] = ['shade', 'oracle', 'healer'];
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

export const ROLE_INFO: Record<Role, { name: string; team: Team; power: string }> = {
  shade: { name: 'Shade', team: 'shades', power: 'Each night, choose someone to eliminate. Blend in by day.' },
  oracle: { name: 'Oracle', team: 'town', power: 'Each night, learn whether one player is a Shade.' },
  healer: { name: 'Healer', team: 'town', power: 'Each night, protect one player (never the same person twice in a row).' },
  townsfolk: { name: 'Townsfolk', team: 'town', power: 'No special power. Watch, listen, and vote wisely.' },
};

export const TEAM_NAME: Record<Team, string> = { shades: 'the Shades', town: 'the Town' };

export interface RoleCounts {
  shade: number;
  oracle: number;
  healer: number;
  townsfolk: number;
}

export interface OracleResult {
  night: number;
  targetId: string;
  isShade: boolean;
}

export interface NightState {
  number: number;
  /** Deadline for the role currently awake, reset each time the turn passes. */
  endsAt: number;
  /** shadeId -> chosen victim. */
  shadePicks: Record<string, string>;
  /** Shade ids in the order they (last) submitted; breaks plurality ties. */
  shadeOrder: string[];
  /** oracleId -> inspected player. */
  oraclePicks: Record<string, string>;
  /** healerId -> protected player. */
  healerPicks: Record<string, string>;
  /**
   * Actors who have pressed Ready. A pick alone is provisional and can be
   * changed; only a ready actor counts toward resolving the night, and their
   * choice is then final.
   */
  ready: string[];
  /**
   * The role currently awake. Roles act one after another in NIGHT_ORDER, so
   * only holders of this role may pick. Null once every role has acted.
   */
  turn: Role | null;
}

export interface DayState {
  number: number;
  endsAt: number;
  /** Voting is closed until this moment, to force a discussion first. */
  votesOpenAt: number;
  /** voterId -> accused id, or null for "skip". */
  votes: Record<string, string | null>;
}

export interface NightOutcome {
  number: number;
  killedId: string | null;
  /** True when the Shades' target was saved by the Healer. */
  saved: boolean;
}

export type LogEntry =
  | { kind: 'start'; playerCount: number }
  | { kind: 'night'; night: number; killedId: string | null; saved: boolean }
  | { kind: 'oracle'; night: number; oracleId: string; targetId: string; isShade: boolean }
  | {
      kind: 'banish';
      day: number;
      banishedId: string | null;
      role: Role | null;
      reason: 'plurality' | 'tie' | 'skip' | 'noVotes';
      votes: Record<string, string | null>;
    }
  | { kind: 'left'; playerId: string }
  | { kind: 'win'; winner: Team };

export interface NightfallState {
  phase: NightfallPhase;
  settings: NightfallSettings;
  /** Current cycle; night N is followed by day N. 0 in the lobby. */
  dayNumber: number;
  participantIds: string[];
  roles: Record<string, Role>;
  alive: Record<string, boolean>;
  /** Participants who were removed from the room mid-game. */
  left: string[];
  night: NightState | null;
  day: DayState | null;
  lastNight: NightOutcome | null;
  oracleResults: Record<string, OracleResult[]>;
  /** healerId -> who they protected last night. */
  lastProtected: Record<string, string | null>;
  log: LogEntry[];
  winner: Team | null;
}

export interface NightfallYou {
  participant: boolean;
  role: Role | null;
  alive: boolean;
  hasNightAction: boolean;
  /** Your current night pick, if any. Provisional until you are ready. */
  nightPick: string | null;
  /** True once you have locked your pick in for this night. */
  nightReady: boolean;
  /** True when your role is the one awake right now. */
  yourTurn: boolean;
  oracleResults: OracleResult[];
  lastProtected: string | null;
  /** Living player ids you may target tonight. */
  eligibleTargets: string[];
  /**
   * What your fellow Shades have chosen tonight, so the coven can coordinate.
   * Empty for every other role. A pick appears as soon as it is made, and
   * `ready` says whether that Shade has locked it in.
   */
  allyPicks: { shadeId: string; targetId: string; ready: boolean }[];
}

export interface NightfallView {
  phase: NightfallPhase;
  settings: NightfallSettings;
  dayNumber: number;
  participantIds: string[];
  alive: Record<string, boolean>;
  left: string[];
  /** Roles this viewer may know: their own, fellow Shades, the dead, and everyone once dead or ended. */
  revealedRoles: Record<string, Role>;
  you: NightfallYou;
  night: {
    number: number;
    endsAt: number;
    /** The role awake right now, or null if the night is wrapping up. */
    turn: Role | null;
    /**
     * Which roles still owe a decision, in wake order.
     *
     * Roles, never player counts. The Shades decide as one coven, so the night
     * waits on "the Shades" until all of them have locked in — publishing how
     * many are outstanding would both read as waiting on players instead of
     * roles, and leak the size of the coven to the whole table.
     */
    pendingRoles: Role[];
  } | null;
  day: DayState | null;
  lastNight: NightOutcome | null;
  log: LogEntry[];
  winner: Team | null;
  /** Server clock at send time, so clients can correct their countdown. */
  serverNow: number;
}

export type NightfallPlayer = BasePlayer;
export type NightfallRoomView = RoomView<NightfallPlayer, NightfallView>;
