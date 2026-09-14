import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import { CATEGORY_NAMES, LETTERS, normalize, startsWithLetter } from './categories.js';
import {
  CATEGORIES_PER_ROUND,
  DEFAULT_ROUNDS,
  DEFAULT_ROUND_SECONDS,
  MAX_ANSWER_LENGTH,
  MAX_ROUNDS,
  MAX_ROUND_SECONDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  MIN_ROUND_SECONDS,
  REVIEW_SECONDS,
  SCORES_SECONDS,
  type AnswerCell,
  type LetterRushRound,
  type LetterRushState,
  type LetterRushView,
} from './types.js';

export type Rng = () => number;

export class LetterRushError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new LetterRushError(message);
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function initialState(): LetterRushState {
  return {
    phase: 'lobby',
    settings: { rounds: DEFAULT_ROUNDS, roundSeconds: DEFAULT_ROUND_SECONDS, categoriesPerRound: CATEGORIES_PER_ROUND },
    round: null,
    scores: {},
    roundsPlayed: 0,
    usedCategories: [],
  };
}

export function setSettings(state: LetterRushState, rounds: number, roundSeconds: number): LetterRushState {
  assert(state.phase === 'lobby', 'Settings can only change in the lobby.');
  assert(Number.isInteger(rounds) && rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS, `Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`);
  assert(
    Number.isInteger(roundSeconds) && roundSeconds >= MIN_ROUND_SECONDS && roundSeconds <= MAX_ROUND_SECONDS,
    `Round length must be between ${MIN_ROUND_SECONDS} and ${MAX_ROUND_SECONDS} seconds.`,
  );
  return { ...state, settings: { ...state.settings, rounds, roundSeconds } };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function requireRound(state: LetterRushState): LetterRushRound {
  assert(state.round, 'No round in progress.');
  return state.round;
}

/** Participants still in the room. */
export function activeIds(round: LetterRushRound): string[] {
  return round.participantIds.filter((id) => !round.leftIds.includes(id));
}

function isActive(round: LetterRushRound, id: string): boolean {
  return round.participantIds.includes(id) && !round.leftIds.includes(id);
}

/** Server-side answer cleaning: trimmed, capped, and blanked if it does not start with the letter. */
export function cleanAnswer(text: string, letter: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER_LENGTH);
  return startsWithLetter(trimmed, letter) ? trimmed : '';
}

/** Strict majority of `others` (the active participants except the author). */
export function isRejected(flaggers: readonly string[], others: readonly string[]): boolean {
  if (others.length === 0) return false;
  const valid = flaggers.filter((id) => others.includes(id)).length;
  return valid * 2 > others.length;
}

/**
 * Grade every answer: blanks 0, duplicates (same normalized text) 0, answers flagged by
 * a strict majority of the other active participants 0, everything else 1.
 * Leavers' answers still count for duplicate detection and are still graded.
 */
export function gradeRound(round: LetterRushRound): { cells: Record<string, AnswerCell>[]; points: Record<string, number> } {
  const active = activeIds(round);
  const authors = Object.keys(round.answers);
  const points: Record<string, number> = {};
  for (const id of round.participantIds) points[id] = 0;

  const cells = round.categories.map((_, ci) => {
    const counts = new Map<string, number>();
    for (const id of authors) {
      const key = normalize(round.answers[id][ci] ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const row: Record<string, AnswerCell> = {};
    for (const id of authors) {
      const text = round.answers[id][ci] ?? '';
      const key = normalize(text);
      const flaggedBy = (round.flags[ci]?.[id] ?? []).filter((f) => active.includes(f) && f !== id);
      let status: AnswerCell['status'] = 'ok';
      if (!key) status = 'blank';
      else if ((counts.get(key) ?? 0) > 1) status = 'dupe';
      else if (isRejected(flaggedBy, active.filter((a) => a !== id))) status = 'rejected';
      const pts = status === 'ok' ? 1 : 0;
      row[id] = { text, status, flaggedBy, points: pts };
      points[id] = (points[id] ?? 0) + pts;
    }
    return row;
  });

  return { cells, points };
}

/* ------------------------------------------------------------------ */
/* Round lifecycle                                                     */
/* ------------------------------------------------------------------ */

function dealRound(state: LetterRushState, participants: BasePlayer[], now: number, rng: Rng): LetterRushState {
  assert(participants.length >= MIN_PLAYERS, `Letter Rush needs at least ${MIN_PLAYERS} players.`);
  const letter = LETTERS[Math.floor(rng() * LETTERS.length)];

  let pool = CATEGORY_NAMES.filter((n) => !state.usedCategories.includes(n));
  let used = state.usedCategories;
  if (pool.length < CATEGORIES_PER_ROUND) {
    pool = CATEGORY_NAMES.slice();
    used = [];
  }
  const categories = shuffle(pool, rng).slice(0, CATEGORIES_PER_ROUND);

  const answers: Record<string, string[]> = {};
  const names: Record<string, string> = {};
  for (const p of participants) {
    answers[p.id] = Array<string>(CATEGORIES_PER_ROUND).fill('');
    names[p.id] = p.name;
  }
  const scores = { ...state.scores };
  for (const p of participants) scores[p.id] ??= 0;

  const round: LetterRushRound = {
    number: state.roundsPlayed + 1,
    letter,
    categories,
    participantIds: participants.map((p) => p.id),
    leftIds: [],
    names,
    answers,
    flags: categories.map(() => ({})),
    doneWriting: [],
    doneReviewing: [],
    endsAt: now + state.settings.roundSeconds * 1000,
    roundPoints: null,
  };
  return { ...state, phase: 'writing', round, scores, usedCategories: [...used, ...categories] };
}

/** Host starts the game from the lobby: fresh scores, round 1. */
export function startGame(state: LetterRushState, participants: BasePlayer[], now: number, rng: Rng = Math.random): LetterRushState {
  assert(state.phase === 'lobby', 'The game has already started.');
  return dealRound({ ...state, scores: {}, roundsPlayed: 0, usedCategories: [] }, participants, now, rng);
}

/** Upsert one answer. Invalid answers (wrong letter) are stored as blank. */
export function submitAnswer(state: LetterRushState, playerId: string, categoryIndex: number, text: string): LetterRushState {
  assert(state.phase === 'writing', 'Writing time is over.');
  const round = requireRound(state);
  assert(isActive(round, playerId), 'You are not in this round.');
  assert(!round.doneWriting.includes(playerId), 'You already pressed Done.');
  assert(Number.isInteger(categoryIndex) && categoryIndex >= 0 && categoryIndex < round.categories.length, 'Unknown category.');
  const mine = round.answers[playerId].slice();
  mine[categoryIndex] = cleanAnswer(String(text ?? ''), round.letter);
  return { ...state, round: { ...round, answers: { ...round.answers, [playerId]: mine } } };
}

/** "Done" in writing or "Done reviewing" in review. Advances when everyone active is done. */
export function markDone(state: LetterRushState, playerId: string, now: number): LetterRushState {
  const round = requireRound(state);
  assert(isActive(round, playerId), 'You are not in this round.');
  if (state.phase === 'writing') {
    if (round.doneWriting.includes(playerId)) return state;
    const next: LetterRushState = { ...state, round: { ...round, doneWriting: [...round.doneWriting, playerId] } };
    return everyoneDone(next.round!.doneWriting, next.round!) ? toReview(next, now) : next;
  }
  if (state.phase === 'review') {
    if (round.doneReviewing.includes(playerId)) return state;
    const next: LetterRushState = { ...state, round: { ...round, doneReviewing: [...round.doneReviewing, playerId] } };
    return everyoneDone(next.round!.doneReviewing, next.round!) ? commitScores(next, now) : next;
  }
  throw new LetterRushError('There is nothing to finish right now.');
}

function everyoneDone(done: string[], round: LetterRushRound): boolean {
  return activeIds(round).every((id) => done.includes(id));
}

/** Toggle a flag on another player's non-blank answer. */
export function toggleFlag(state: LetterRushState, flaggerId: string, categoryIndex: number, authorId: string): LetterRushState {
  assert(state.phase === 'review', 'You can only flag answers during review.');
  const round = requireRound(state);
  assert(isActive(round, flaggerId), 'You are not in this round.');
  assert(flaggerId !== authorId, 'You cannot flag your own answer.');
  assert(Number.isInteger(categoryIndex) && categoryIndex >= 0 && categoryIndex < round.categories.length, 'Unknown category.');
  assert(authorId in round.answers, 'That player is not in this round.');
  assert(round.answers[authorId][categoryIndex], 'That answer is already blank.');

  const cat = { ...round.flags[categoryIndex] };
  const current = cat[authorId] ?? [];
  cat[authorId] = current.includes(flaggerId) ? current.filter((id) => id !== flaggerId) : [...current, flaggerId];
  const flags = round.flags.slice();
  flags[categoryIndex] = cat;
  return { ...state, round: { ...round, flags } };
}

function toReview(state: LetterRushState, now: number): LetterRushState {
  const round = requireRound(state);
  return { ...state, phase: 'review', round: { ...round, endsAt: now + REVIEW_SECONDS * 1000 } };
}

/** Commit the graded round to the running totals and show the summary. */
function commitScores(state: LetterRushState, now: number): LetterRushState {
  const round = requireRound(state);
  const { points } = gradeRound(round);
  const scores = { ...state.scores };
  for (const [id, pts] of Object.entries(points)) scores[id] = (scores[id] ?? 0) + pts;
  return {
    ...state,
    phase: 'scores',
    scores,
    roundsPlayed: state.roundsPlayed + 1,
    round: { ...round, roundPoints: points, endsAt: now + SCORES_SECONDS * 1000 },
  };
}

/** Host: end review now. */
export function finishReview(state: LetterRushState, now: number): LetterRushState {
  assert(state.phase === 'review', 'There is no review to finish.');
  return commitScores(state, now);
}

/** Leave the round summary: deal the next round, or end the game after the last one. */
export function nextRound(state: LetterRushState, participants: BasePlayer[], now: number, rng: Rng = Math.random): LetterRushState {
  assert(state.phase === 'scores', 'The round is not over yet.');
  if (state.roundsPlayed >= state.settings.rounds || participants.length < MIN_PLAYERS) {
    return { ...state, phase: 'ended' };
  }
  return dealRound(state, participants, now, rng);
}

/** True when the current timed phase has run past its deadline. */
export function isTimeUp(state: LetterRushState, now: number): boolean {
  const round = state.round;
  if (!round) return false;
  return (state.phase === 'writing' || state.phase === 'review' || state.phase === 'scores') && now >= round.endsAt;
}

/** Auto-advance whichever timed phase has expired. No-op otherwise. */
export function timeUp(state: LetterRushState, now: number, participants: BasePlayer[], rng: Rng = Math.random): LetterRushState {
  if (!isTimeUp(state, now)) return state;
  switch (state.phase) {
    case 'writing':
      return toReview(state, now);
    case 'review':
      return commitScores(state, now);
    case 'scores':
      return nextRound(state, participants, now, rng);
    default:
      return state;
  }
}

/** A participant left for good: keep their answers, drop them from readiness and majorities. */
export function removeParticipant(state: LetterRushState, playerId: string, now: number): LetterRushState {
  const round = state.round;
  if (!round || !isActive(round, playerId)) return state;
  if (state.phase !== 'writing' && state.phase !== 'review') {
    return { ...state, round: { ...round, leftIds: [...round.leftIds, playerId] } };
  }
  const next: LetterRushState = { ...state, round: { ...round, leftIds: [...round.leftIds, playerId] } };
  const r = next.round!;
  if (activeIds(r).length === 0) return next;
  if (state.phase === 'writing' && everyoneDone(r.doneWriting, r)) return toReview(next, now);
  if (state.phase === 'review' && everyoneDone(r.doneReviewing, r)) return commitScores(next, now);
  return next;
}

/** Back to the lobby, keeping settings. */
export function reset(state: LetterRushState): LetterRushState {
  return { ...initialState(), settings: state.settings };
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export function viewFor(state: LetterRushState, playerId: string, now: number): LetterRushView {
  const round = state.round;
  let roundView: LetterRushView['round'] = null;
  if (round) {
    const writing = state.phase === 'writing';
    const graded = writing ? null : gradeRound(round);
    const answers = writing ? (playerId in round.answers ? { [playerId]: round.answers[playerId] } : {}) : round.answers;
    roundView = {
      ...round,
      answers,
      cells: graded?.cells ?? null,
      points: state.phase === 'scores' || state.phase === 'ended' ? round.roundPoints : graded?.points ?? null,
      activeIds: activeIds(round),
    };
  }
  return {
    phase: state.phase,
    settings: state.settings,
    round: roundView,
    scores: state.scores,
    roundsPlayed: state.roundsPlayed,
    serverNow: now,
  };
}
