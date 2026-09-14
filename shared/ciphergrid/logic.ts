import {
  ASSASSIN_CARDS,
  DEFAULT_CLUE_SECONDS,
  DEFAULT_GUESS_SECONDS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_SECONDS,
  TIMER_OFF,
  BOARD_SIZE,
  NEUTRAL_CARDS,
  OTHER_TEAM_CARDS,
  STARTING_TEAM_CARDS,
  UNLIMITED_CLUE,
  otherTeam,
  type Card,
  type CardType,
  type CipherGridSettings,
  type GameState,
  type GameView,
  type Player,
  type Team,
} from './types.js';
import { WORDS } from './words.js';
import { UserError } from '../errors.js';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function emptyGame(): GameState {
  return {
    phase: 'lobby',
    settings: { clueSeconds: DEFAULT_CLUE_SECONDS, guessSeconds: DEFAULT_GUESS_SECONDS },
    cards: [],
    startingTeam: 'red',
    turn: 'red',
    currentClue: null,
    guessesRemaining: 0,
    turnEndsAt: null,
    winner: null,
    log: [],
  };
}

/** A partial update: only the fields the host actually changed. */
export type SettingsPatch = Partial<CipherGridSettings>;

export function setSettings(state: GameState, patch: SettingsPatch): GameState {
  assert(state.phase !== 'playing', 'Settings can only change between games.');
  const next = { ...state.settings };

  for (const key of ['clueSeconds', 'guessSeconds'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    assert(
      Number.isInteger(value) &&
        (value === TIMER_OFF || (value >= MIN_TIMER_SECONDS && value <= MAX_TIMER_SECONDS)),
      `A timer must be 0 (off) or between ${MIN_TIMER_SECONDS} and ${MAX_TIMER_SECONDS} seconds.`,
    );
    next[key] = value;
  }

  return { ...state, settings: next };
}

/** When the current phase should run out, or null when that timer is off. */
function deadline(state: GameState, kind: 'clue' | 'guess', now: number): number | null {
  const seconds = kind === 'clue' ? state.settings.clueSeconds : state.settings.guessSeconds;
  return seconds === TIMER_OFF ? null : now + seconds * 1000;
}

/** Build a fresh 5x5 board and start play. */
export function createGame(
  rng: Rng = Math.random,
  wordList: readonly string[] = WORDS,
  settings: CipherGridSettings = { clueSeconds: DEFAULT_CLUE_SECONDS, guessSeconds: DEFAULT_GUESS_SECONDS },
  now: number = Date.now(),
): GameState {
  const startingTeam: Team = rng() < 0.5 ? 'red' : 'blue';
  const words = shuffle(wordList, rng).slice(0, BOARD_SIZE);

  const types: CardType[] = [
    ...Array<CardType>(STARTING_TEAM_CARDS).fill(startingTeam),
    ...Array<CardType>(OTHER_TEAM_CARDS).fill(otherTeam(startingTeam)),
    ...Array<CardType>(NEUTRAL_CARDS).fill('neutral'),
    ...Array<CardType>(ASSASSIN_CARDS).fill('assassin'),
  ];
  const shuffledTypes = shuffle(types, rng);

  const cards: Card[] = words.map((word, i) => ({ word, type: shuffledTypes[i], revealed: false }));

  return {
    phase: 'playing',
    settings,
    turnEndsAt: settings.clueSeconds === TIMER_OFF ? null : now + settings.clueSeconds * 1000,
    cards,
    startingTeam,
    turn: startingTeam,
    currentClue: null,
    guessesRemaining: 0,
    winner: null,
    log: [],
  };
}

export class GameError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameError(message);
}

export function remainingCards(state: GameState): { red: number; blue: number } {
  let red = 0;
  let blue = 0;
  for (const c of state.cards) {
    if (c.revealed) continue;
    if (c.type === 'red') red++;
    else if (c.type === 'blue') blue++;
  }
  return { red, blue };
}

export function validateClueWord(word: string, state: GameState): string | null {
  const w = word.trim();
  if (!w) return 'Clue cannot be empty.';
  if (w.length > 30) return 'Clue is too long.';
  if (/\s/.test(w)) return 'Clue must be a single word.';
  const upper = w.toUpperCase();
  const onBoard = state.cards.some((c) => !c.revealed && c.word.toUpperCase() === upper);
  if (onBoard) return 'Clue cannot be a word on the board.';
  return null;
}

export function giveClue(
  state: GameState,
  player: Player,
  word: string,
  count: number,
  now: number = Date.now(),
): GameState {
  assert(state.phase === 'playing', 'Game is not in progress.');
  assert(player.team === state.turn, 'It is not your team\'s turn.');
  assert(player.role === 'spymaster', 'Only the spymaster can give a clue.');
  assert(state.currentClue === null, 'A clue has already been given this turn.');
  const problem = validateClueWord(word, state);
  assert(!problem, problem ?? 'Invalid clue.');
  assert(
    Number.isInteger(count) && (count === UNLIMITED_CLUE || (count >= 0 && count <= 9)),
    'Clue number must be 0-9 or unlimited.',
  );

  const clueWord = word.trim().toUpperCase();
  // Guesses allowed: count + 1 bonus. 0 and unlimited allow unlimited guesses.
  const guessesRemaining = count === 0 || count === UNLIMITED_CLUE ? Infinity : count + 1;

  return {
    ...state,
    currentClue: { word: clueWord, count, team: player.team },
    guessesRemaining,
    // The clue is in; the operatives' clock starts now.
    turnEndsAt: deadline(state, 'guess', now),
    log: [...state.log, { kind: 'clue', team: player.team, by: player.name, word: clueWord, count }],
  };
}

export function guess(state: GameState, player: Player, index: number, now: number = Date.now()): GameState {
  assert(state.phase === 'playing', 'Game is not in progress.');
  assert(player.team === state.turn, 'It is not your team\'s turn.');
  assert(player.role === 'operative', 'Only operatives can guess.');
  assert(state.currentClue !== null, 'Wait for your spymaster to give a clue.');
  assert(Number.isInteger(index) && index >= 0 && index < state.cards.length, 'Invalid card.');
  const card = state.cards[index];
  assert(!card.revealed, 'That card is already revealed.');

  const team = player.team;
  const cards = state.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c));
  const log = [
    ...state.log,
    { kind: 'guess' as const, team, by: player.name, word: card.word, result: card.type },
  ];
  const next: GameState = { ...state, cards, log };

  if (card.type === 'assassin') {
    return finish(next, otherTeam(team), 'assassin');
  }

  const remaining = remainingCards(next);
  if (remaining.red === 0 || remaining.blue === 0) {
    return finish(next, remaining.red === 0 ? 'red' : 'blue', 'cards');
  }

  if (card.type !== team) {
    // Wrong card: turn ends immediately.
    return switchTurn(next, now);
  }

  const guessesRemaining = state.guessesRemaining - 1;
  if (guessesRemaining <= 0) return switchTurn(next, now);
  return { ...next, guessesRemaining };
}

export function endTurn(state: GameState, player: Player, now: number = Date.now()): GameState {
  assert(state.phase === 'playing', 'Game is not in progress.');
  assert(player.team === state.turn, 'It is not your team\'s turn.');
  assert(player.role === 'operative', 'Only operatives can end the turn.');
  assert(state.currentClue !== null, 'You cannot end the turn before a clue is given.');
  return switchTurn(
    {
      ...state,
      log: [...state.log, { kind: 'endTurn', team: player.team, by: player.name }],
    },
    now,
  );
}

function finish(state: GameState, winner: Team, reason: 'cards' | 'assassin'): GameState {
  return {
    ...state,
    phase: 'ended',
    winner,
    currentClue: null,
    guessesRemaining: 0,
    turnEndsAt: null,
    log: [...state.log, { kind: 'win', team: winner, reason }],
  };
}

function switchTurn(state: GameState, now: number): GameState {
  const next: GameState = { ...state, turn: otherTeam(state.turn), currentClue: null, guessesRemaining: 0 };
  // The next team's spymaster is on the clock.
  return { ...next, turnEndsAt: deadline(next, 'clue', now) };
}

/** True once the current phase's deadline has passed. */
export function isTurnTimeUp(state: GameState, now: number): boolean {
  return state.phase === 'playing' && state.turnEndsAt !== null && now >= state.turnEndsAt;
}

/**
 * The clock ran out. A spymaster who never gave a clue, or operatives who ran
 * out of guessing time, simply forfeit the rest of the turn.
 */
export function turnTimeout(state: GameState, now: number): GameState {
  assert(state.phase === 'playing', 'Game is not in progress.');
  if (!isTurnTimeUp(state, now)) return state;
  const phase = state.currentClue === null ? 'clue' : 'guess';
  const timedOut: GameState = {
    ...state,
    log: [...state.log, { kind: 'timeout', team: state.turn, phase }],
  };
  return switchTurn(timedOut, now);
}

/** Project the full state into what a given player is allowed to see. */
export function viewFor(state: GameState, player: Player | null, now: number = Date.now()): GameView {
  const seesAll = state.phase === 'ended' || player?.role === 'spymaster';
  return {
    ...state,
    cards: state.cards.map((c) =>
      seesAll || c.revealed
        ? { word: c.word, type: c.type, revealed: c.revealed }
        : { word: c.word, revealed: false },
    ),
    guessesRemaining: state.guessesRemaining === Infinity ? UNLIMITED_CLUE : state.guessesRemaining,
    remaining: remainingCards(state),
    serverNow: now,
  };
}

/** Both teams need at least one spymaster and one operative to start. */
export function teamsReady(players: Player[]): string | null {
  for (const team of ['red', 'blue'] as Team[]) {
    const members = players.filter((p) => p.team === team);
    if (!members.some((p) => p.role === 'spymaster')) return `${cap(team)} team needs a spymaster.`;
    if (!members.some((p) => p.role === 'operative')) return `${cap(team)} team needs at least one operative.`;
  }
  return null;
}

/** Randomly split players into two teams with one spymaster each. */
export function randomizeTeams(players: Player[], rng: Rng = Math.random): Player[] {
  const shuffled = shuffle(players, rng);
  return shuffled.map((p, i) => {
    const team: Team = i % 2 === 0 ? 'red' : 'blue';
    const role = i < 2 ? 'spymaster' : 'operative';
    return { ...p, team, role };
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
