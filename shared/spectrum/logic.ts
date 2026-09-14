import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import { SPECTRA, type Spectrum } from './spectra.js';
import {
  DEFAULT_ROUNDS,
  GUESS_SECONDS,
  MAX_CLUE_LENGTH,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  REVEAL_SECONDS,
  type GuessView,
  type SpectrumRound,
  type SpectrumState,
  type SpectrumView,
} from './types.js';

export type Rng = () => number;

export class SpectrumError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SpectrumError(message);
}

const isHuman = (p: BasePlayer) => p.connected && !p.isBot;

export function initialState(): SpectrumState {
  return {
    phase: 'lobby',
    settings: { rounds: DEFAULT_ROUNDS },
    round: null,
    scores: {},
    roundsPlayed: 0,
    usedSpectra: [],
  };
}

export function setSettings(state: SpectrumState, rounds: number): SpectrumState {
  assert(state.phase === 'lobby', 'Settings can only change in the lobby.');
  assert(
    Number.isInteger(rounds) && rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS,
    `Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`,
  );
  return { ...state, settings: { ...state.settings, rounds } };
}

/**
 * Points for a guess at the given distance from the target.
 *
 * Four bands, deliberately tight: the bullseye is 2 wide and scoring stops at
 * 20, so a little over a third of the scale pays anything at all. A clue has to
 * be genuinely precise to land +4, and a vague one scores nothing.
 */
export function pointsForDistance(distance: number): number {
  const d = Math.abs(distance);
  if (d <= 2) return 4;
  if (d <= 6) return 3;
  if (d <= 12) return 2;
  if (d <= 20) return 1;
  return 0;
}

/**
 * The connected human seated after the previous psychic, wrapping around. Bots
 * are never psychic. Returns null when no human is connected.
 */
export function nextPsychic(players: BasePlayer[], previousId: string | null): BasePlayer | null {
  const humans = players.filter(isHuman);
  if (humans.length === 0) return null;
  const prevIndex = previousId ? players.findIndex((p) => p.id === previousId) : -1;
  if (prevIndex === -1) return humans[0];
  for (let step = 1; step <= players.length; step++) {
    const candidate = players[(prevIndex + step) % players.length];
    if (isHuman(candidate)) return candidate;
  }
  return humans[0];
}

function pickSpectrum(state: SpectrumState, rng: Rng, spectra: readonly Spectrum[]): { index: number; used: number[] } {
  let used = state.usedSpectra;
  let available = spectra.map((_, i) => i).filter((i) => !used.includes(i));
  if (available.length === 0) {
    used = [];
    available = spectra.map((_, i) => i);
  }
  const index = available[Math.floor(rng() * available.length)];
  return { index, used: [...used, index] };
}

/**
 * Deal the next round: rotate the psychic, draw a spectrum and a secret target.
 * Everyone connected except the psychic is a guesser. Ends the game when no
 * human is left to be psychic or nobody is left to guess.
 */
export function startRound(
  state: SpectrumState,
  players: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  spectra: readonly Spectrum[] = SPECTRA,
): SpectrumState {
  const psychic = nextPsychic(players, state.round?.psychicId ?? null);
  const guessers = players.filter((p) => p.connected && p.id !== psychic?.id);
  if (!psychic || guessers.length === 0) return { ...state, phase: 'ended' };

  const { index, used } = pickSpectrum(state, rng, spectra);
  const round: SpectrumRound = {
    number: state.roundsPlayed + 1,
    psychicId: psychic.id,
    spectrum: spectra[index],
    target: Math.min(100, Math.floor(rng() * 101)),
    clue: null,
    guesserIds: guessers.map((p) => p.id),
    guesses: {},
    guessEndsAt: null,
    revealEndsAt: null,
    points: null,
    psychicPoints: null,
  };
  const scores = { ...state.scores };
  for (const p of players) if (p.connected) scores[p.id] ??= 0;
  return { ...state, phase: 'clue', round, scores, usedSpectra: used };
}

/** Host starts a game from the lobby. */
export function startGame(
  state: SpectrumState,
  players: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  spectra: readonly Spectrum[] = SPECTRA,
): SpectrumState {
  assert(state.phase === 'lobby', 'A game is already in progress.');
  const connected = players.filter((p) => p.connected);
  assert(connected.length >= MIN_PLAYERS, `Spectrum needs at least ${MIN_PLAYERS} players.`);
  assert(connected.some(isHuman), 'At least one human player is needed to be the psychic.');
  const fresh: SpectrumState = { ...state, round: null, scores: {}, roundsPlayed: 0, usedSpectra: [] };
  return startRound(fresh, players, now, rng, spectra);
}

function requireRound(state: SpectrumState): SpectrumRound {
  assert(state.round, 'No round in progress.');
  return state.round;
}

/** Validate a clue: 1-40 characters, no digits. Returns the trimmed clue. */
export function cleanClue(text: string): string {
  const clue = text.trim().replace(/\s+/g, ' ');
  assert(clue.length > 0, 'Type a clue first.');
  assert(clue.length <= MAX_CLUE_LENGTH, `Clues can be at most ${MAX_CLUE_LENGTH} characters.`);
  assert(!/\d/.test(clue), 'No numbers in the clue, that is the whole point!');
  return clue;
}

/** The psychic gives the clue; guessing opens with a timer. */
export function giveClue(state: SpectrumState, playerId: string, text: string, now: number): SpectrumState {
  assert(state.phase === 'clue', 'It is not time for a clue.');
  const round = requireRound(state);
  assert(playerId === round.psychicId, 'Only the psychic gives the clue.');
  const clue = cleanClue(String(text ?? ''));
  return {
    ...state,
    phase: 'guessing',
    round: { ...round, clue, guessEndsAt: now + GUESS_SECONDS * 1000 },
  };
}

/** A guesser moves their needle. Allowed until they lock in. */
export function setGuess(state: SpectrumState, playerId: string, value: number): SpectrumState {
  assert(state.phase === 'guessing', 'Guessing is not open.');
  const round = requireRound(state);
  assert(round.guesserIds.includes(playerId), 'You are not guessing this round.');
  assert(!round.guesses[playerId]?.locked, 'You have already locked in.');
  assert(Number.isInteger(value) && value >= 0 && value <= 100, 'Guess must be a whole number from 0 to 100.');
  return { ...state, round: { ...round, guesses: { ...round.guesses, [playerId]: { value, locked: false } } } };
}

/**
 * Lock a guess. When every guesser who is still around has locked, the round
 * is revealed. `isActive` lets the caller ignore guessers who have disconnected.
 */
export function lockGuess(
  state: SpectrumState,
  playerId: string,
  now: number,
  isActive: (id: string) => boolean = () => true,
): SpectrumState {
  assert(state.phase === 'guessing', 'Guessing is not open.');
  const round = requireRound(state);
  assert(round.guesserIds.includes(playerId), 'You are not guessing this round.');
  const guess = round.guesses[playerId];
  assert(guess, 'Move the needle before locking in.');
  assert(!guess.locked, 'You have already locked in.');
  const guesses = { ...round.guesses, [playerId]: { ...guess, locked: true } };
  const next: SpectrumState = { ...state, round: { ...round, guesses } };
  return allLocked(next, isActive) ? reveal(next, now) : next;
}

function allLocked(state: SpectrumState, isActive: (id: string) => boolean): boolean {
  const round = requireRound(state);
  const active = round.guesserIds.filter(isActive);
  return active.length > 0 && active.every((id) => round.guesses[id]?.locked);
}

/** Score the round and show the target. Guessers without a guess score 0. */
export function reveal(state: SpectrumState, now: number): SpectrumState {
  assert(state.phase === 'guessing', 'Nothing to reveal yet.');
  const round = requireRound(state);
  const points: Record<string, number> = {};
  const earned: number[] = [];
  for (const id of round.guesserIds) {
    const guess = round.guesses[id];
    const pts = guess ? pointsForDistance(guess.value - round.target) : 0;
    points[id] = pts;
    if (guess) earned.push(pts);
  }
  const psychicPoints = earned.length ? Math.round(earned.reduce((a, b) => a + b, 0) / earned.length) : 0;
  const scores = { ...state.scores };
  for (const [id, pts] of Object.entries(points)) scores[id] = (scores[id] ?? 0) + pts;
  scores[round.psychicId] = (scores[round.psychicId] ?? 0) + psychicPoints;
  return {
    ...state,
    phase: 'reveal',
    round: { ...round, points, psychicPoints, revealEndsAt: now + REVEAL_SECONDS * 1000 },
    scores,
    roundsPlayed: state.roundsPlayed + 1,
  };
}

export function isGuessTimeUp(state: SpectrumState, now: number): boolean {
  return state.phase === 'guessing' && !!state.round?.guessEndsAt && now >= state.round.guessEndsAt;
}

/** Reveal once the guessing clock has run out. No-op otherwise. */
export function guessTimeUp(state: SpectrumState, now: number): SpectrumState {
  return isGuessTimeUp(state, now) ? reveal(state, now) : state;
}

/** From the reveal: deal the next round, or end the game after the last one. */
export function nextRound(
  state: SpectrumState,
  players: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  spectra: readonly Spectrum[] = SPECTRA,
): SpectrumState {
  assert(state.phase === 'reveal', 'The round is still in progress.');
  if (state.roundsPlayed >= state.settings.rounds) {
    return { ...state, phase: 'ended', round: state.round && { ...state.round, revealEndsAt: null } };
  }
  return startRound(state, players, now, rng, spectra);
}

export function isRevealTimeUp(state: SpectrumState, now: number): boolean {
  return state.phase === 'reveal' && !!state.round?.revealEndsAt && now >= state.round.revealEndsAt;
}

/** Auto-advance from the reveal once its clock has run out. No-op otherwise. */
export function revealTimeUp(
  state: SpectrumState,
  players: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  spectra: readonly Spectrum[] = SPECTRA,
): SpectrumState {
  return isRevealTimeUp(state, now) ? nextRound(state, players, now, rng, spectra) : state;
}

/**
 * The psychic is gone before giving a clue: hand the round to the next human.
 * `players` should already reflect the departure (disconnected or removed).
 */
export function skipPsychic(
  state: SpectrumState,
  players: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  spectra: readonly Spectrum[] = SPECTRA,
): SpectrumState {
  assert(state.phase === 'clue', 'The psychic can only be skipped before the clue.');
  const round = requireRound(state);
  const psychic = players.find((p) => p.id === round.psychicId);
  if (psychic && isHuman(psychic)) return state;
  // Un-count this round: it never happened.
  const rewound: SpectrumState = { ...state, usedSpectra: state.usedSpectra.slice(0, -1) };
  return startRound(rewound, players, now, rng, spectra);
}

/**
 * A player left for good. `players` is the room roster after the removal.
 * The game never waits on someone who is gone.
 */
export function removeParticipant(
  state: SpectrumState,
  playerId: string,
  players: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  spectra: readonly Spectrum[] = SPECTRA,
): SpectrumState {
  const round = state.round;
  if (!round || state.phase === 'lobby' || state.phase === 'ended' || state.phase === 'reveal') return state;

  if (playerId === round.psychicId) {
    if (state.phase === 'clue') return skipPsychic(state, players, now, rng, spectra);
    return state; // guessing continues; the clue is already out
  }
  if (!round.guesserIds.includes(playerId)) return state;

  const guesserIds = round.guesserIds.filter((id) => id !== playerId);
  const { [playerId]: _gone, ...guesses } = round.guesses;
  const next: SpectrumState = { ...state, round: { ...round, guesserIds, guesses } };

  if (guesserIds.length === 0) {
    // Nobody left to guess this round: skip it (clue) or score it empty (guessing).
    if (state.phase === 'clue') {
      const rewound: SpectrumState = { ...next, usedSpectra: next.usedSpectra.slice(0, -1) };
      return startRound(rewound, players, now, rng, spectra);
    }
    return reveal(next, now);
  }
  if (state.phase === 'guessing' && allLocked(next, () => true)) return reveal(next, now);
  return next;
}

/** Back to the lobby with the same settings, scores wiped. */
export function reset(state: SpectrumState): SpectrumState {
  return { ...initialState(), settings: state.settings };
}

export function viewFor(state: SpectrumState, playerId: string, now: number): SpectrumView {
  const round = state.round;
  let roundView: SpectrumView['round'] = null;
  if (round) {
    const isPsychic = round.psychicId === playerId;
    const revealed = state.phase === 'reveal' || state.phase === 'ended';
    const guesses: Record<string, GuessView> = {};
    for (const [id, g] of Object.entries(round.guesses)) {
      guesses[id] = { value: revealed || id === playerId ? g.value : null, locked: g.locked };
    }
    roundView = {
      ...round,
      isPsychic,
      target: isPsychic || revealed ? round.target : null,
      guesses,
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
