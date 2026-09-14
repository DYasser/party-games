import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import { SYMBOLS, pairsFor } from './symbols.js';
import {
  DEFAULT_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
  MIN_ROUND_SECONDS,
  PEEK_MS,
  defaultSettings,
  isBoardSize,
  type BoardSize,
  type CardView,
  type PairRushSettings,
  type PairRushState,
  type PairRushView,
  type PlayerBoard,
  type RivalView,
} from './types.js';

export class PairRushError extends UserError {}

export type Rng = () => number;

export function initialState(settings: PairRushSettings = defaultSettings()): PairRushState {
  return {
    phase: 'lobby',
    settings,
    deck: [],
    boards: {},
    startedAt: null,
    endsAt: null,
    finished: [],
  };
}

export function setSettings(
  state: PairRushState,
  patch: { size?: unknown; roundSeconds?: unknown },
): PairRushState {
  if (state.phase !== 'lobby') throw new PairRushError('Settings are locked once the race starts.');

  const next = { ...state.settings };

  if (patch.size !== undefined) {
    if (!isBoardSize(patch.size)) throw new PairRushError('Pick one of the offered board sizes.');
    next.size = patch.size;
  }

  if (patch.roundSeconds !== undefined) {
    const n = Number(patch.roundSeconds);
    if (!Number.isFinite(n)) throw new PairRushError('Time limit must be a number.');
    next.roundSeconds = Math.min(MAX_ROUND_SECONDS, Math.max(MIN_ROUND_SECONDS, Math.round(n)));
  }

  return { ...state, settings: next };
}

/** Fisher-Yates, so every deal is equally likely. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build one deal: each of the needed symbols twice, shuffled.
 *
 * Every player gets this same array. That is the point of the game — a race is
 * only fair if nobody got an easier board.
 */
export function buildDeck(size: BoardSize, rng: Rng): string[] {
  const pairs = pairsFor(size);
  if (pairs > SYMBOLS.length) {
    throw new PairRushError('That board is bigger than the symbol set.');
  }
  const chosen = shuffle(SYMBOLS, rng).slice(0, pairs);
  return shuffle([...chosen, ...chosen], rng);
}

function emptyBoard(): PlayerBoard {
  return {
    matched: [],
    flipped: [],
    peekUntil: null,
    attempts: 0,
    finishOrder: null,
    finishedAt: null,
  };
}

export function startGame(
  state: PairRushState,
  participants: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
): PairRushState {
  if (participants.length === 0) throw new PairRushError('Nobody is here to race.');

  const boards: Record<string, PlayerBoard> = {};
  for (const p of participants) boards[p.id] = emptyBoard();

  return {
    ...state,
    phase: 'playing',
    deck: buildDeck(state.settings.size, rng),
    boards,
    startedAt: now,
    endsAt: now + state.settings.roundSeconds * 1000,
    finished: [],
  };
}

/** A player who joins mid-race gets a board so they can start from scratch. */
export function ensureBoard(state: PairRushState, playerId: string): PairRushState {
  if (state.phase !== 'playing' || state.boards[playerId]) return state;
  return { ...state, boards: { ...state.boards, [playerId]: emptyBoard() } };
}

/**
 * Clear a mismatched pair once its peek window has passed.
 *
 * Applied lazily on the player's next action and eagerly by the server's timer,
 * so the board is correct whether or not anyone is looking at it.
 */
export function settlePeek(board: PlayerBoard, now: number): PlayerBoard {
  if (board.peekUntil === null || now < board.peekUntil) return board;
  return { ...board, flipped: [], peekUntil: null };
}

export function settleAll(state: PairRushState, now: number): PairRushState {
  if (state.phase !== 'playing') return state;
  let changed = false;
  const boards: Record<string, PlayerBoard> = {};
  for (const [id, board] of Object.entries(state.boards)) {
    const next = settlePeek(board, now);
    if (next !== board) changed = true;
    boards[id] = next;
  }
  return changed ? { ...state, boards } : state;
}

/**
 * Turn over one card.
 *
 * Flipping the second card of a pair is an "attempt": a match locks both cards
 * face-up, a miss leaves them showing until `PEEK_MS` passes.
 */
export function flip(
  state: PairRushState,
  playerId: string,
  index: number,
  now: number,
): PairRushState {
  if (state.phase !== 'playing') throw new PairRushError('The race is not running.');

  const existing = state.boards[playerId];
  if (!existing) throw new PairRushError('You are not in this race.');
  if (existing.finishOrder !== null) throw new PairRushError('You have already finished.');

  const board = settlePeek(existing, now);
  if (board.peekUntil !== null) throw new PairRushError('Wait for the cards to turn back.');

  if (!Number.isInteger(index) || index < 0 || index >= state.deck.length) {
    throw new PairRushError('That card is not on the board.');
  }
  if (board.matched.includes(index)) throw new PairRushError('That pair is already found.');
  if (board.flipped.includes(index)) throw new PairRushError('That card is already face-up.');

  // First card of a pair: just show it.
  if (board.flipped.length === 0) {
    return writeBoard(state, playerId, { ...board, flipped: [index] });
  }

  const first = board.flipped[0];
  const attempts = board.attempts + 1;

  if (state.deck[first] === state.deck[index]) {
    const matched = [...board.matched, first, index];
    const done = matched.length === state.deck.length;
    const next: PlayerBoard = {
      ...board,
      matched,
      flipped: [],
      peekUntil: null,
      attempts,
      finishOrder: done ? state.finished.length + 1 : null,
      finishedAt: done ? now : null,
    };
    const withBoard = writeBoard(state, playerId, next);
    if (!done) return withBoard;
    return endIfDone({ ...withBoard, finished: [...withBoard.finished, playerId] }, now);
  }

  // A miss: both stay up briefly, then turn back.
  return writeBoard(state, playerId, {
    ...board,
    flipped: [first, index],
    peekUntil: now + PEEK_MS,
    attempts,
  });
}

function writeBoard(state: PairRushState, playerId: string, board: PlayerBoard): PairRushState {
  return { ...state, boards: { ...state.boards, [playerId]: board } };
}

/** The race ends when everyone still present has cleared their board. */
function endIfDone(state: PairRushState, now: number): PairRushState {
  const solving = Object.values(state.boards).filter((b) => b.finishOrder === null);
  if (solving.length > 0) return state;
  return { ...state, phase: 'ended', endsAt: now };
}

export function isTimeUp(state: PairRushState, now: number): boolean {
  return state.phase === 'playing' && state.endsAt !== null && now >= state.endsAt;
}

/** Time ran out: whoever has not finished simply does not place. */
export function timeUp(state: PairRushState, now: number): PairRushState {
  if (state.phase !== 'playing') return state;
  return { ...state, phase: 'ended', endsAt: now };
}

/**
 * A player left. Their board goes with them, and the race ends if everyone
 * still here has already finished — otherwise the survivors would be stuck
 * waiting on somebody who is gone.
 */
export function removePlayer(state: PairRushState, playerId: string, now: number): PairRushState {
  if (!state.boards[playerId]) return state;
  const boards = { ...state.boards };
  delete boards[playerId];
  const next: PairRushState = {
    ...state,
    boards,
    finished: state.finished.filter((id) => id !== playerId),
  };
  if (next.phase !== 'playing') return next;
  if (Object.keys(boards).length === 0) return { ...next, phase: 'ended', endsAt: now };
  return endIfDone(next, now);
}

/** How long a finisher took, measured from the moment the race began. */
function elapsedFor(state: PairRushState, finishedAt: number | null): number | null {
  if (finishedAt === null || state.startedAt === null) return null;
  return Math.max(0, finishedAt - state.startedAt);
}

export function pairsTotal(state: PairRushState): number {
  return state.deck.length / 2;
}

/**
 * Project the state for one player.
 *
 * A card's symbol is sent only when that player has it face-up or has already
 * matched it. Sending the whole deck and hiding it in CSS would put the answer
 * in the browser, which is the one thing this game cannot allow.
 */
export function viewFor(
  state: PairRushState,
  player: BasePlayer | null,
  players: BasePlayer[],
  now: number = Date.now(),
): PairRushView {
  const board = player ? state.boards[player.id] : undefined;
  const settled = board ? settlePeek(board, now) : undefined;
  const ended = state.phase === 'ended';

  const cards: CardView[] = state.deck.map((symbol, i) => {
    const matched = settled?.matched.includes(i) ?? false;
    const flipped = settled?.flipped.includes(i) ?? false;
    // Once the race is over there is nothing left to protect, and seeing the
    // finished board is half the fun of comparing runs.
    const visible = matched || flipped || ended;
    return { symbol: visible ? symbol : null, matched, flipped };
  });

  const rivals: RivalView[] = players
    .filter((p) => !player || p.id !== player.id)
    .map((p) => {
      const b = state.boards[p.id];
      return {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        connected: p.connected,
        pairsFound: b ? b.matched.length / 2 : 0,
        attempts: b?.attempts ?? 0,
        finishOrder: b?.finishOrder ?? null,
        finishMs: elapsedFor(state, b?.finishedAt ?? null),
      };
    });

  return {
    phase: state.phase,
    settings: state.settings,
    size: state.settings.size,
    cards,
    pairsTotal: pairsTotal(state),
    pairsFound: settled ? settled.matched.length / 2 : 0,
    attempts: settled?.attempts ?? 0,
    peekUntil: settled?.peekUntil ?? null,
    finishOrder: settled?.finishOrder ?? null,
    finishMs: elapsedFor(state, settled?.finishedAt ?? null),
    rivals,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    serverNow: now,
  };
}

export const SETTINGS_BOUNDS = {
  MIN_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
  DEFAULT_ROUND_SECONDS,
};
