import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import {
  DEFAULT_ROUNDS,
  DEFAULT_ROUND_SECONDS,
  MAX_GUESSES,
  MAX_ROUNDS,
  MAX_ROUND_SECONDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  MIN_ROUND_SECONDS,
  REVEAL_MS,
  SPEED_BONUS,
  WORD_LENGTH,
  type Guess,
  type Mark,
  type PlayerBoard,
  type PlayerBoardView,
  type WordRaceRound,
  type WordRaceSettings,
  type WordRaceState,
  type WordSourceView,
  type WordRaceView,
} from './types.js';
import { BOT_OPENERS } from './words.js';
import {
  getDictionary,
  isAcceptedGuess,
  parseCustomList,
  MAX_CUSTOM_WORDS,
  MIN_CUSTOM_WORDS,
} from './dictionary.js';
import { DEFAULT_LANGUAGE, foldWord, isLanguageCode, LANGUAGES, type LanguageCode } from './languages.js';

export type Rng = () => number;

export class WordRaceError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new WordRaceError(message);
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * Standard two-pass scoring: exact matches first, then presence using the
 * remaining letter counts so duplicates are never over-reported.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(WORD_LENGTH).fill('x');
  const remaining: Record<string, number> = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) marks[i] = 'g';
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (marks[i] === 'g') continue;
    const c = guess[i];
    if (remaining[c] > 0) {
      marks[i] = 'y';
      remaining[c]--;
    }
  }
  return marks;
}

export function isSolvedMarks(marks: Mark[]): boolean {
  return marks.length === WORD_LENGTH && marks.every((m) => m === 'g');
}

/** Points for solving on guess `k` (1-based) with the given finish order (1-based). */
export function pointsFor(guessNumber: number, finishOrder: number): number {
  const base = Math.max(0, MAX_GUESSES + 1 - guessNumber) * 10;
  const bonus = SPEED_BONUS[finishOrder - 1] ?? 0;
  return base + bonus;
}

/** Candidates still consistent with every guess so far. Used by bots. */
export function filterCandidates(candidates: readonly string[], guesses: readonly Guess[]): string[] {
  return candidates.filter((w) =>
    guesses.every((g) => {
      const marks = scoreGuess(g.word, w);
      return marks.every((m, i) => m === g.marks[i]);
    }),
  );
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export function defaultSettings(): WordRaceSettings {
  return {
    rounds: DEFAULT_ROUNDS,
    roundSeconds: DEFAULT_ROUND_SECONDS,
    maxGuesses: MAX_GUESSES,
    language: DEFAULT_LANGUAGE,
    customWords: [],
  };
}

/**
 * The answers a game will draw from: the host's custom list when they supplied
 * one, otherwise the language's own answer pool.
 */
export function answerPool(settings: WordRaceSettings): readonly string[] {
  if (settings.customWords.length > 0) return settings.customWords;
  return getDictionary(settings.language).answers;
}

export function initialState(settings: WordRaceSettings = defaultSettings()): WordRaceState {
  return {
    phase: 'lobby',
    settings: { ...settings, maxGuesses: MAX_GUESSES },
    round: null,
    scores: {},
    roundsPlayed: 0,
    usedAnswers: [],
  };
}

export function setSettings(
  state: WordRaceState,
  patch: { rounds?: number; roundSeconds?: number; language?: string; customWords?: string },
): WordRaceState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'Settings can only change between games.');
  const rounds = patch.rounds ?? state.settings.rounds;
  const roundSeconds = patch.roundSeconds ?? state.settings.roundSeconds;
  assert(
    Number.isInteger(rounds) && rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS,
    `Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`,
  );
  assert(
    Number.isInteger(roundSeconds) && roundSeconds >= MIN_ROUND_SECONDS && roundSeconds <= MAX_ROUND_SECONDS,
    `Round length must be between ${MIN_ROUND_SECONDS} and ${MAX_ROUND_SECONDS} seconds.`,
  );

  let language: LanguageCode = state.settings.language;
  if (patch.language !== undefined) {
    assert(isLanguageCode(patch.language), 'Unknown language.');
    language = patch.language;
  }

  let customWords = state.settings.customWords;
  if (patch.customWords !== undefined) {
    const { words, rejected } = parseCustomList(patch.customWords);
    // An empty submission clears the list and returns to the language pool.
    if (words.length === 0 && rejected.length === 0) {
      customWords = [];
    } else {
      assert(
        words.length >= MIN_CUSTOM_WORDS,
        `A custom list needs at least ${MIN_CUSTOM_WORDS} valid five-letter words (found ${words.length}).`,
      );
      assert(words.length <= MAX_CUSTOM_WORDS, `A custom list can hold at most ${MAX_CUSTOM_WORDS} words.`);
      customWords = words;
    }
  }

  return { ...state, settings: { rounds, roundSeconds, maxGuesses: MAX_GUESSES, language, customWords } };
}

function emptyBoard(): PlayerBoard {
  return { guesses: [], status: 'solving', finishOrder: null, points: 0 };
}

function pickAnswer(used: readonly string[], rng: Rng, pool: readonly string[]): string {
  const fresh = pool.filter((w) => !used.includes(w));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(rng() * from.length)];
}

/** Start a brand-new game from the lobby (or after one has ended). */
export function startGame(
  state: WordRaceState,
  participants: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  pool?: readonly string[],
): WordRaceState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'A game is already in progress.');
  assert(participants.length >= MIN_PLAYERS, `Word Race needs at least ${MIN_PLAYERS} player.`);
  const fresh: WordRaceState = { ...initialState(state.settings) };
  return dealRound(fresh, participants, now, rng, pool);
}

/** Deal the next round of the current game. */
export function dealRound(
  state: WordRaceState,
  participants: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  pool?: readonly string[],
): WordRaceState {
  assert(participants.length >= MIN_PLAYERS, `Word Race needs at least ${MIN_PLAYERS} player.`);
  const answer = pickAnswer(state.usedAnswers, rng, pool ?? answerPool(state.settings));
  const boards: Record<string, PlayerBoard> = {};
  const scores = { ...state.scores };
  for (const p of participants) {
    boards[p.id] = emptyBoard();
    scores[p.id] ??= 0;
  }
  const round: WordRaceRound = {
    number: state.roundsPlayed + 1,
    answer,
    participantIds: participants.map((p) => p.id),
    boards,
    startedAt: now,
    endsAt: now + state.settings.roundSeconds * 1000,
    revealEndsAt: null,
    endReason: null,
  };
  return { ...state, phase: 'playing', round, scores, usedAnswers: [...state.usedAnswers, answer] };
}

function requireRound(state: WordRaceState): WordRaceRound {
  assert(state.round, 'No round in progress.');
  return state.round;
}

/** Submit a guess for one player. Marks it, settles solve/fail, and ends the round if everyone is done. */
export function submitGuess(state: WordRaceState, playerId: string, rawWord: string, now: number): WordRaceState {
  assert(state.phase === 'playing', 'The round is not running.');
  const round = requireRound(state);
  assert(now < round.endsAt, 'Time is up for this round.');
  const board = round.boards[playerId];
  assert(board && round.participantIds.includes(playerId), 'You are not in this round.');
  assert(board.status === 'solving', board.status === 'solved' ? 'You already solved it!' : 'You are out of guesses.');
  const word = foldWord(rawWord);
  assert(/^[A-Z]{5}$/.test(word), 'Guesses must be exactly five letters.');
  assert(
    isAcceptedGuess(word, state.settings.language, state.settings.customWords),
    `${word} is not in the ${LANGUAGES[state.settings.language].name} word list.`,
  );
  assert(!board.guesses.some((g) => g.word === word), 'You already tried that word.');

  const marks = scoreGuess(word, round.answer);
  const guesses = [...board.guesses, { word, marks }];
  let next: PlayerBoard = { ...board, guesses };
  if (isSolvedMarks(marks)) {
    const solvedSoFar = Object.values(round.boards).filter((b) => b.status === 'solved').length;
    const finishOrder = solvedSoFar + 1;
    next = { ...next, status: 'solved', finishOrder, points: pointsFor(guesses.length, finishOrder) };
  } else if (guesses.length >= state.settings.maxGuesses) {
    next = { ...next, status: 'failed', points: 0 };
  }

  const boards = { ...round.boards, [playerId]: next };
  const scores = { ...state.scores };
  if (next.status === 'solved') scores[playerId] = (scores[playerId] ?? 0) + next.points;

  const updated: WordRaceState = { ...state, round: { ...round, boards }, scores };
  return everyoneDone(updated) ? finishRound(updated, 'allDone', now) : updated;
}

function everyoneDone(state: WordRaceState): boolean {
  const round = requireRound(state);
  return round.participantIds.every((id) => round.boards[id]?.status !== 'solving');
}

/** True once the guessing clock has run past endsAt. */
export function isTimeUp(state: WordRaceState, now: number): boolean {
  return state.phase === 'playing' && !!state.round && now >= state.round.endsAt;
}

/** Clock ran out: anyone still solving fails, then reveal. No-op if not due. */
export function timeUp(state: WordRaceState, now: number): WordRaceState {
  if (!isTimeUp(state, now)) return state;
  return finishRound(state, 'timeUp', now);
}

function finishRound(state: WordRaceState, reason: 'allDone' | 'timeUp', now: number): WordRaceState {
  const round = requireRound(state);
  const boards: Record<string, PlayerBoard> = {};
  for (const [id, b] of Object.entries(round.boards)) {
    boards[id] = b.status === 'solving' ? { ...b, status: 'failed', points: 0 } : b;
  }
  return {
    ...state,
    phase: 'reveal',
    round: { ...round, boards, revealEndsAt: now + REVEAL_MS, endReason: reason },
    roundsPlayed: state.roundsPlayed + 1,
  };
}

/** True once the reveal has been on screen long enough to auto-advance. */
export function isRevealOver(state: WordRaceState, now: number): boolean {
  return state.phase === 'reveal' && !!state.round && state.round.revealEndsAt !== null && now >= state.round.revealEndsAt;
}

/** Leave the reveal: deal the next round or end the game after the last one. */
export function advance(
  state: WordRaceState,
  participants: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  pool?: readonly string[],
): WordRaceState {
  assert(state.phase === 'reveal', 'There is no reveal to skip.');
  if (state.roundsPlayed >= state.settings.rounds || participants.length < MIN_PLAYERS) {
    return { ...state, phase: 'ended', round: state.round ? { ...state.round, revealEndsAt: null } : null };
  }
  return dealRound(state, participants, now, rng, pool);
}

/** A participant left for good: stop waiting on them. May end the round. */
export function removeParticipant(state: WordRaceState, playerId: string, now: number): WordRaceState {
  const round = state.round;
  if (!round || state.phase !== 'playing') return state;
  if (!round.participantIds.includes(playerId)) return state;
  const participantIds = round.participantIds.filter((id) => id !== playerId);
  const next: WordRaceState = { ...state, round: { ...round, participantIds } };
  if (participantIds.length === 0) return finishRound(next, 'allDone', now);
  return everyoneDone(next) ? finishRound(next, 'allDone', now) : next;
}

/** Back to the lobby, keeping settings but wiping scores. */
export function reset(state: WordRaceState): WordRaceState {
  return initialState(state.settings);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export function viewFor(state: WordRaceState, playerId: string, now: number): WordRaceView {
  const round = state.round;
  const revealed = state.phase === 'reveal' || state.phase === 'ended';
  let roundView: WordRaceView['round'] = null;
  if (round) {
    const boards: Record<string, PlayerBoardView> = {};
    for (const [id, b] of Object.entries(round.boards)) {
      const showLetters = revealed || id === playerId;
      boards[id] = {
        guesses: b.guesses.map((g) => ({ word: showLetters ? g.word : null, marks: g.marks })),
        status: b.status,
        finishOrder: b.finishOrder,
        points: b.points,
      };
    }
    roundView = {
      number: round.number,
      answer: revealed ? round.answer : null,
      participantIds: round.participantIds,
      boards,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      revealEndsAt: round.revealEndsAt,
      endReason: round.endReason,
    };
  }
  return {
    phase: state.phase,
    settings: state.settings,
    round: roundView,
    scores: state.scores,
    roundsPlayed: state.roundsPlayed,
    serverNow: now,
    wordSource: wordSourceView(state),
  };
}

/**
 * What the client may know about the word source. The answer pool is listed
 * only in the lobby (or between games): revealing it mid-round would let a
 * player narrow the secret word down, especially with a short custom list.
 */
export function wordSourceView(state: WordRaceState): WordSourceView {
  const { language, customWords } = state.settings;
  const dict = getDictionary(language);
  const custom = customWords.length > 0;
  const pool = custom ? customWords : dict.answers;
  const betweenGames = state.phase === 'lobby' || state.phase === 'ended';
  return {
    language,
    custom,
    answerCount: pool.length,
    guessCount: dict.guesses.size + (custom ? customWords.filter((w) => !dict.guesses.has(w)).length : 0),
    answers: betweenGames ? [...pool] : null,
  };
}

/**
 * A bot's next guess: any remaining answer consistent with its feedback so far.
 * Openers come first when they are available in this language.
 */
export function botGuess(
  board: { guesses: readonly Guess[] },
  settings: WordRaceSettings,
  pickOne: (items: string[]) => string,
): string {
  const pool = [...answerPool(settings)];
  if (board.guesses.length === 0) {
    const openers = BOT_OPENERS.filter((w) => pool.includes(w));
    if (openers.length) return pickOne(openers);
  }
  const tried = new Set(board.guesses.map((g) => g.word));
  const candidates = filterCandidates(pool, board.guesses).filter((w) => !tried.has(w));
  if (candidates.length) return pickOne(candidates);
  const untried = pool.filter((w) => !tried.has(w));
  return pickOne(untried.length ? untried : pool);
}
