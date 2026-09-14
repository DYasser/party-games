import type { BasePlayer, Room as BaseRoom, RoomView as BaseRoomView } from '../room.js';

export type Team = 'red' | 'blue';
export type Role = 'spymaster' | 'operative';
export type CardType = 'red' | 'blue' | 'neutral' | 'assassin';
export type Phase = 'lobby' | 'playing' | 'ended';

export interface Card {
  word: string;
  /** Hidden identity. Only sent to spymasters (or for revealed cards / after game end). */
  type: CardType;
  revealed: boolean;
}

/** Card as seen by a specific player. `type` is undefined when hidden from them. */
export interface CardView {
  word: string;
  type?: CardType;
  revealed: boolean;
}

export interface Clue {
  word: string;
  /** 0-9, or UNLIMITED_CLUE (-1) for "unlimited" */
  count: number;
  team: Team;
}

export type LogEntry =
  | { kind: 'clue'; team: Team; by: string; word: string; count: number }
  | { kind: 'guess'; team: Team; by: string; word: string; result: CardType }
  | { kind: 'endTurn'; team: Team; by: string }
  | { kind: 'timeout'; team: Team; phase: 'clue' | 'guess' }
  | { kind: 'win'; team: Team; reason: 'cards' | 'assassin' };

export interface CipherGridSettings {
  /** Seconds the spymaster has to give a clue. 0 means no limit. */
  clueSeconds: number;
  /** Seconds the operatives have to finish guessing. 0 means no limit. */
  guessSeconds: number;
}

export const DEFAULT_CLUE_SECONDS = 0;
export const DEFAULT_GUESS_SECONDS = 0;
export const MIN_TIMER_SECONDS = 15;
export const MAX_TIMER_SECONDS = 300;
/** The value that switches a timer off entirely. */
export const TIMER_OFF = 0;

export interface GameState {
  phase: Phase;
  settings: CipherGridSettings;
  cards: Card[];
  startingTeam: Team;
  turn: Team;
  currentClue: Clue | null;
  /** How many guesses the active team may still make this turn (Infinity for unlimited). */
  guessesRemaining: number;
  /**
   * When the current phase runs out, or null when untimed. During a team's
   * clue this is the spymaster's deadline; once a clue is in it is the
   * operatives' guessing deadline.
   */
  turnEndsAt: number | null;
  winner: Team | null;
  log: LogEntry[];
}

export interface GameView extends Omit<GameState, 'cards'> {
  cards: CardView[];
  remaining: { red: number; blue: number };
  /** Server clock at send time, so clients can correct their countdown. */
  serverNow: number;
}

export interface Player extends BasePlayer {
  team: Team | null;
  role: Role | null;
}

export type Room = BaseRoom<Player, GameState>;
export type RoomView = BaseRoomView<Player, GameView>;

export const BOARD_SIZE = 25;
export const STARTING_TEAM_CARDS = 9;
export const OTHER_TEAM_CARDS = 8;
export const NEUTRAL_CARDS = 7;
export const ASSASSIN_CARDS = 1;
export const UNLIMITED_CLUE = -1;

export function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}
