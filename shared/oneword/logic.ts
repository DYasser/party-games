import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import {
  DECK_SIZE,
  GUESS_SECONDS,
  HINT_SECONDS,
  MAX_HINT_LENGTH,
  MIN_PLAYERS,
  RESULT_SECONDS,
  REVIEW_SECONDS,
  type CardOutcome,
  type Hint,
  type HintView,
  type OneWordCard,
  type OneWordState,
  type OneWordView,
} from './types.js';
import { ALL_WORDS } from './words.js';

export type Rng = () => number;

export class OneWordError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new OneWordError(message);
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const HINT_PATTERN = /^[A-Za-z][A-Za-z'-]*$/;

/** Lowercase, trimmed, letters only. */
export function lettersOnly(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Canonical form used to detect duplicate hints and to compare guesses:
 * letters only, with a simple plural suffix removed ("boxes" -> "box", "cats" -> "cat").
 */
export function normalizeWord(text: string): string {
  const w = lettersOnly(text);
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(x|s|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** True when a hint is the secret word or shares letters with it in either direction. */
export function hintConflicts(secret: string, hint: string): boolean {
  const a = lettersOnly(secret);
  const b = lettersOnly(hint);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a) || normalizeWord(a) === normalizeWord(b);
}

/** Why a hint is unacceptable, or null when it is fine. */
export function hintProblem(secret: string, text: string): string | null {
  const t = text.trim();
  if (!t) return 'Write one word.';
  if (t.length > MAX_HINT_LENGTH) return `Hints are at most ${MAX_HINT_LENGTH} characters.`;
  if (/\s/.test(t)) return 'Only one word, no spaces.';
  if (!HINT_PATTERN.test(t)) return 'Letters, hyphens and apostrophes only.';
  if (hintConflicts(secret, t)) return 'That is too close to the secret word.';
  return null;
}

export function guessMatches(secret: string, guess: string): boolean {
  const g = normalizeWord(guess);
  return g.length > 0 && g === normalizeWord(secret);
}

export function rating(score: number): string {
  if (score >= 13) return 'Perfect!';
  if (score >= 11) return 'Awesome';
  if (score >= 9) return 'Great';
  if (score >= 7) return 'Good';
  if (score >= 4) return 'Not bad';
  return 'Try again';
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function initialState(): OneWordState {
  return {
    phase: 'lobby',
    deck: [],
    outcomes: [],
    participantIds: [],
    guesserCursor: 0,
    card: null,
    score: 0,
    phaseEndsAt: null,
    gamesPlayed: 0,
  };
}

function requireCard(state: OneWordState): OneWordCard {
  assert(state.card, 'No card is in play.');
  return state.card;
}

function isHinter(card: OneWordCard, playerId: string): boolean {
  return card.hinterIds.includes(playerId);
}

/** Deal a fresh deck to the given participants (seat order) and start the first card. */
export function startGame(
  state: OneWordState,
  participants: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  words: readonly string[] = ALL_WORDS,
): OneWordState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'A game is already in progress.');
  assert(participants.length >= MIN_PLAYERS, `One Word needs at least ${MIN_PLAYERS} players.`);
  assert(words.length >= DECK_SIZE, 'Not enough words to build a deck.');

  const deck = shuffle(words, rng).slice(0, DECK_SIZE);
  const next: OneWordState = {
    ...state,
    phase: 'hinting',
    deck,
    outcomes: deck.map(() => null),
    participantIds: participants.map((p) => p.id),
    guesserCursor: 0,
    card: null,
    score: 0,
    phaseEndsAt: null,
  };
  return beginCard(next, 0, now);
}

function beginCard(state: OneWordState, index: number, now: number): OneWordState {
  const n = state.participantIds.length;
  const guesserId = state.participantIds[((state.guesserCursor % n) + n) % n];
  const card: OneWordCard = {
    index,
    word: state.deck[index],
    guesserId,
    hinterIds: state.participantIds.filter((id) => id !== guesserId),
    hints: {},
    ready: [],
    guess: null,
    outcome: null,
  };
  return { ...state, phase: 'hinting', card, phaseEndsAt: now + HINT_SECONDS * 1000 };
}

/** Hinter submits or replaces their hint. Moves to review once every present hinter has one. */
export function submitHint(
  state: OneWordState,
  playerId: string,
  text: string,
  present: readonly string[],
  now: number,
): OneWordState {
  assert(state.phase === 'hinting', 'Hints are closed for this card.');
  const card = requireCard(state);
  assert(playerId !== card.guesserId, 'You are the guesser this card.');
  assert(isHinter(card, playerId), 'You are not a hinter this card.');
  const problem = hintProblem(card.word, text);
  assert(!problem, problem ?? '');

  const hint: Hint = { playerId, text: text.trim(), cancelled: false, duplicate: false };
  const next: OneWordState = { ...state, card: { ...card, hints: { ...card.hints, [playerId]: hint } } };
  return allHintsIn(next, present) ? enterReview(next, now) : next;
}

function allHintsIn(state: OneWordState, present: readonly string[]): boolean {
  const card = requireCard(state);
  const active = card.hinterIds.filter((id) => present.includes(id));
  return active.every((id) => id in card.hints);
}

/** Close hinting: strike identical hints, then let the hinters review. */
export function enterReview(state: OneWordState, now: number): OneWordState {
  assert(state.phase === 'hinting', 'Not in the hinting phase.');
  const card = requireCard(state);
  const groups = new Map<string, string[]>();
  for (const hint of Object.values(card.hints)) {
    const key = normalizeWord(hint.text);
    groups.set(key, [...(groups.get(key) ?? []), hint.playerId]);
  }
  const hints: Record<string, Hint> = {};
  for (const hint of Object.values(card.hints)) {
    const dup = (groups.get(normalizeWord(hint.text))?.length ?? 0) > 1;
    hints[hint.playerId] = { ...hint, cancelled: dup, duplicate: dup };
  }
  return {
    ...state,
    phase: 'review',
    card: { ...card, hints, ready: [] },
    phaseEndsAt: now + REVIEW_SECONDS * 1000,
  };
}

/** A hinter flags (or un-flags) another hint as invalid. Duplicates stay cancelled. */
export function toggleCancel(state: OneWordState, playerId: string, targetId: string): OneWordState {
  assert(state.phase === 'review', 'Hints can only be cancelled during review.');
  const card = requireCard(state);
  assert(isHinter(card, playerId), 'Only hinters can cancel hints.');
  const hint = card.hints[targetId];
  assert(hint, 'That player did not write a hint.');
  assert(!hint.duplicate, 'Duplicate hints are always cancelled.');
  return {
    ...state,
    card: { ...card, hints: { ...card.hints, [targetId]: { ...hint, cancelled: !hint.cancelled } } },
  };
}

/** A hinter is happy with the hints. Moves to guessing once every present hinter is ready. */
export function setReady(state: OneWordState, playerId: string, present: readonly string[], now: number): OneWordState {
  assert(state.phase === 'review', 'Nothing to confirm right now.');
  const card = requireCard(state);
  assert(isHinter(card, playerId), 'Only hinters can show the hints.');
  if (card.ready.includes(playerId)) return state;
  const next: OneWordState = { ...state, card: { ...card, ready: [...card.ready, playerId] } };
  return allReady(next, present) ? enterGuessing(next, now) : next;
}

function allReady(state: OneWordState, present: readonly string[]): boolean {
  const card = requireCard(state);
  const active = card.hinterIds.filter((id) => present.includes(id));
  return active.every((id) => card.ready.includes(id));
}

export function enterGuessing(state: OneWordState, now: number): OneWordState {
  assert(state.phase === 'review', 'Not in the review phase.');
  return { ...state, phase: 'guessing', phaseEndsAt: now + GUESS_SECONDS * 1000 };
}

/** Hints the guesser is allowed to see. */
export function survivingHints(card: OneWordCard): Hint[] {
  return card.hinterIds.map((id) => card.hints[id]).filter((h): h is Hint => !!h && !h.cancelled);
}

/** The guesser names the word. Right: +1. Wrong: this card fails and the next one is burned. */
export function submitGuess(state: OneWordState, playerId: string, text: string, now: number): OneWordState {
  assert(state.phase === 'guessing', 'It is not time to guess.');
  const card = requireCard(state);
  assert(playerId === card.guesserId, 'Only the guesser can guess.');
  const guess = text.trim();
  assert(guess.length > 0, 'Type a guess or pass.');
  assert(guess.length <= 40, 'That guess is too long.');
  return finishCard(state, guessMatches(card.word, guess) ? 'success' : 'fail', guess, now);
}

/** The guesser gives up: the card is lost but nothing else is. */
export function passCard(state: OneWordState, playerId: string, now: number): OneWordState {
  assert(state.phase === 'guessing', 'It is not time to pass.');
  const card = requireCard(state);
  assert(playerId === card.guesserId, 'Only the guesser can pass.');
  return finishCard(state, 'pass', null, now);
}

function finishCard(state: OneWordState, outcome: CardOutcome, guess: string | null, now: number): OneWordState {
  const card = requireCard(state);
  const outcomes = state.outcomes.slice();
  outcomes[card.index] = outcome;
  if (outcome === 'fail') {
    const burn = outcomes.findIndex((o, i) => i > card.index && o === null);
    if (burn !== -1) outcomes[burn] = 'discarded';
  }
  return {
    ...state,
    phase: 'result',
    outcomes,
    score: state.score + (outcome === 'success' ? 1 : 0),
    card: { ...card, guess, outcome },
    phaseEndsAt: now + RESULT_SECONDS * 1000,
  };
}

/** Leave the result screen: deal the next card, or end the game when the deck is spent. */
export function nextCard(state: OneWordState, now: number): OneWordState {
  assert(state.phase === 'result', 'The current card is not finished.');
  const index = state.outcomes.findIndex((o) => o === null);
  const next: OneWordState = { ...state, guesserCursor: state.guesserCursor + 1 };
  if (index === -1 || next.participantIds.length < 2) return endGame(next);
  return beginCard(next, index, now);
}

function endGame(state: OneWordState): OneWordState {
  return { ...state, phase: 'ended', phaseEndsAt: null, gamesPlayed: state.gamesPlayed + 1 };
}

export function isTimeUp(state: OneWordState, now: number): boolean {
  return state.phaseEndsAt !== null && now >= state.phaseEndsAt;
}

/** The phase clock ran out: close hinting, show the hints, auto-pass, or advance. */
export function timeUp(state: OneWordState, present: readonly string[], now: number): OneWordState {
  if (!isTimeUp(state, now)) return state;
  switch (state.phase) {
    case 'hinting':
      return enterReview(state, now);
    case 'review':
      return enterGuessing(state, now);
    case 'guessing':
      return finishCard(state, 'pass', null, now);
    case 'result':
      return nextCard(state, now);
    default:
      return state;
  }
}

/**
 * Re-check readiness against who is actually connected, so a hinter who dropped
 * never holds the card up. Returns the same state when nothing changes.
 */
export function presenceCheck(state: OneWordState, present: readonly string[], now: number): OneWordState {
  if (!state.card) return state;
  if (state.phase === 'hinting' && allHintsIn(state, present)) return enterReview(state, now);
  if (state.phase === 'review' && allReady(state, present)) return enterGuessing(state, now);
  // A guesser who disconnected keeps the card until the 60s clock auto-passes for them.
  return state;
}

/** A seated player left for good. */
export function removeParticipant(state: OneWordState, playerId: string, present: readonly string[], now: number): OneWordState {
  if (state.phase === 'lobby' || state.phase === 'ended') return state;
  const removedIndex = state.participantIds.indexOf(playerId);
  if (removedIndex === -1) return state;
  const participantIds = state.participantIds.filter((id) => id !== playerId);
  // Keep the rotation pointing at the same seat: if the leaver sat at or before the
  // current guesser, everyone after them shifts down by one (and nextCard adds one).
  const cur = state.guesserCursor % state.participantIds.length;
  const guesserCursor = removedIndex <= cur ? cur - 1 : cur;
  let next: OneWordState = { ...state, participantIds, guesserCursor };
  const card = state.card;
  if (!card) return next;

  if (participantIds.length < 2) {
    return endGame({ ...next, card: { ...card, outcome: card.outcome ?? 'discarded' } });
  }

  if (card.guesserId === playerId) {
    if (state.phase === 'result') return next;
    // The guesser is gone: burn this card and move on.
    const outcomes = next.outcomes.slice();
    outcomes[card.index] = 'discarded';
    return { ...next, phase: 'result', outcomes, card: { ...card, outcome: 'discarded' }, phaseEndsAt: now + RESULT_SECONDS * 1000 };
  }

  const { [playerId]: _hint, ...hints } = card.hints;
  next = {
    ...next,
    card: { ...card, hinterIds: card.hinterIds.filter((id) => id !== playerId), hints, ready: card.ready.filter((id) => id !== playerId) },
  };
  return state.phase === 'result' ? next : presenceCheck(next, present, now);
}

/** Back to the lobby. */
export function reset(): OneWordState {
  return initialState();
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function toView(hint: Hint): HintView {
  return { playerId: hint.playerId, text: hint.text, cancelled: hint.cancelled, duplicate: hint.duplicate };
}

export function viewFor(state: OneWordState, playerId: string, now: number): OneWordView {
  const card = state.card;
  let cardView: OneWordView['card'] = null;
  if (card) {
    const isGuesser = card.guesserId === playerId;
    const revealed = state.phase === 'result' || state.phase === 'ended';
    const ordered = card.hinterIds.map((id) => card.hints[id]).filter((h): h is Hint => !!h);
    let hints: HintView[] | null = null;
    if (state.phase === 'hinting') hints = null;
    else if (revealed || !isGuesser) hints = ordered.map(toView);
    else if (state.phase === 'guessing') hints = survivingHints(card).map(toView);
    // guesser during review: null

    cardView = {
      index: card.index,
      word: isGuesser && !revealed ? null : card.word,
      guesserId: card.guesserId,
      hinterIds: card.hinterIds,
      submittedIds: Object.keys(card.hints),
      yourHint: card.hints[playerId]?.text ?? null,
      hints,
      ready: card.ready,
      guess: card.guess,
      outcome: card.outcome,
    };
  }
  return {
    phase: state.phase,
    deckSize: state.deck.length || DECK_SIZE,
    outcomes: state.outcomes,
    participantIds: state.participantIds,
    card: cardView,
    score: state.score,
    phaseEndsAt: state.phaseEndsAt,
    gamesPlayed: state.gamesPlayed,
    rating: state.phase === 'ended' ? rating(state.score) : null,
    serverNow: now,
  };
}
