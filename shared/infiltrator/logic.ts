import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import { LOCATIONS, LOCATION_NAMES, type Location } from './locations.js';
import {
  DEFAULT_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
  MIN_PLAYERS,
  MIN_ROUND_SECONDS,
  type RoundResult,
  type InfiltratorRound,
  type InfiltratorState,
  type InfiltratorView,
} from './types.js';

export type Rng = () => number;

export class InfiltratorError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InfiltratorError(message);
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function initialState(): InfiltratorState {
  return {
    phase: 'lobby',
    settings: { roundSeconds: DEFAULT_ROUND_SECONDS },
    round: null,
    scores: {},
    roundsPlayed: 0,
  };
}

export function setSettings(state: InfiltratorState, roundSeconds: number): InfiltratorState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'Settings can only change between rounds.');
  assert(
    Number.isInteger(roundSeconds) && roundSeconds >= MIN_ROUND_SECONDS && roundSeconds <= MAX_ROUND_SECONDS,
    `Round length must be between ${MIN_ROUND_SECONDS / 60} and ${MAX_ROUND_SECONDS / 60} minutes.`,
  );
  return { ...state, settings: { ...state.settings, roundSeconds } };
}

/** Deal a new round to the given participants (all connected players). */
export function startRound(
  state: InfiltratorState,
  participants: BasePlayer[],
  now: number,
  rng: Rng = Math.random,
  locations: readonly Location[] = LOCATIONS,
): InfiltratorState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'A round is already in progress.');
  assert(participants.length >= MIN_PLAYERS, `Infiltrator needs at least ${MIN_PLAYERS} players.`);

  const location = locations[Math.floor(rng() * locations.length)];
  const order = shuffle(participants, rng);
  const spy = order[0];
  const roleDeck = shuffle(location.roles, rng);
  const roles: Record<string, string> = {};
  order.slice(1).forEach((p, i) => {
    roles[p.id] = roleDeck[i % roleDeck.length];
  });

  const round: InfiltratorRound = {
    number: state.roundsPlayed + 1,
    location: location.name,
    spyId: spy.id,
    roles,
    participantIds: participants.map((p) => p.id),
    endsAt: now + state.settings.roundSeconds * 1000,
    pausedAt: null,
    accusation: null,
    accusedBy: [],
    finalVotes: {},
    result: null,
  };

  const scores = { ...state.scores };
  for (const p of participants) scores[p.id] ??= 0;

  return { ...state, phase: 'playing', round, scores };
}

function requireRound(state: InfiltratorState): InfiltratorRound {
  assert(state.round, 'No round in progress.');
  return state.round;
}

function isParticipant(round: InfiltratorRound, id: string): boolean {
  return round.participantIds.includes(id);
}

/** Start an accusation vote. Freezes the clock. */
export function accuse(state: InfiltratorState, accuserId: string, accusedId: string, now: number): InfiltratorState {
  assert(state.phase === 'playing', 'You can only accuse while the round is running.');
  const round = requireRound(state);
  assert(isParticipant(round, accuserId), 'You are not in this round.');
  assert(isParticipant(round, accusedId), 'That player is not in this round.');
  assert(accuserId !== accusedId, 'You cannot accuse yourself.');
  assert(!round.accusation, 'An accusation is already being voted on.');
  assert(!round.accusedBy.includes(accuserId), 'You have already made your accusation this round.');

  return {
    ...state,
    round: {
      ...round,
      pausedAt: now,
      accusation: { accuserId, accusedId, votes: { [accuserId]: true } },
      accusedBy: [...round.accusedBy, accuserId],
    },
  };
}

/** Vote on the active accusation. Unanimous yes convicts; any no cancels and resumes the clock. */
export function voteAccusation(state: InfiltratorState, voterId: string, agree: boolean, now: number): InfiltratorState {
  assert(state.phase === 'playing', 'There is nothing to vote on.');
  const round = requireRound(state);
  const acc = round.accusation;
  assert(acc, 'There is no accusation to vote on.');
  assert(isParticipant(round, voterId), 'You are not in this round.');
  assert(voterId !== acc.accusedId, 'The accused does not vote.');
  assert(!(voterId in acc.votes), 'You already voted.');

  if (!agree) return resumeClock({ ...state, round: { ...round, accusation: null } }, now);

  const votes = { ...acc.votes, [voterId]: true };
  const voters = round.participantIds.filter((id) => id !== acc.accusedId);
  const unanimous = voters.every((id) => votes[id]);
  const next: InfiltratorState = { ...state, round: { ...round, accusation: { ...acc, votes } } };
  if (!unanimous) return next;

  const caught = acc.accusedId === round.spyId;
  return finish(next, {
    winner: caught ? 'agents' : 'spy',
    reason: caught ? 'caught' : 'wrongAccusation',
    accusedId: acc.accusedId,
    accuserId: acc.accuserId,
  });
}

function resumeClock(state: InfiltratorState, now: number): InfiltratorState {
  const round = requireRound(state);
  if (round.pausedAt === null) return state;
  const frozenFor = now - round.pausedAt;
  return { ...state, round: { ...round, pausedAt: null, endsAt: round.endsAt + frozenFor } };
}

/** The spy names the location. Ends the round either way. */
export function spyGuess(state: InfiltratorState, playerId: string, location: string): InfiltratorState {
  assert(state.phase === 'playing' || state.phase === 'voting', 'The round is over.');
  const round = requireRound(state);
  assert(playerId === round.spyId, 'Only the spy can guess the location.');
  assert(!round.accusation, 'Wait for the accusation vote to finish.');
  const guess = location.trim();
  assert(LOCATION_NAMES.some((n) => n.toLowerCase() === guess.toLowerCase()), 'Pick a location from the list.');
  const right = guess.toLowerCase() === round.location.toLowerCase();
  return finish(state, {
    winner: right ? 'spy' : 'agents',
    reason: right ? 'spyGuessedRight' : 'spyGuessedWrong',
    guessedLocation: guess,
  });
}

/** True once the (unpaused) clock has run past endsAt. */
export function isTimeUp(state: InfiltratorState, now: number): boolean {
  const round = state.round;
  return state.phase === 'playing' && !!round && round.pausedAt === null && now >= round.endsAt;
}

/** Move from playing to the final vote once the clock runs out. No-op if paused for an accusation. */
export function timeUp(state: InfiltratorState, now: number): InfiltratorState {
  if (!isTimeUp(state, now)) return state;
  return { ...state, phase: 'voting' };
}

/** After time is up, every participant votes for one suspect. Auto-tallies when all have voted. */
export function finalVote(state: InfiltratorState, voterId: string, suspectId: string): InfiltratorState {
  assert(state.phase === 'voting', 'The final vote has not started.');
  const round = requireRound(state);
  assert(isParticipant(round, voterId), 'You are not in this round.');
  assert(isParticipant(round, suspectId), 'That player is not in this round.');
  assert(voterId !== suspectId, 'You cannot vote for yourself.');

  const finalVotes = { ...round.finalVotes, [voterId]: suspectId };
  const next: InfiltratorState = { ...state, round: { ...round, finalVotes } };
  const everyoneVoted = round.participantIds.every((id) => id in finalVotes);
  return everyoneVoted ? tallyFinalVotes(next) : next;
}

/** Resolve the final vote: a unique plurality on the spy catches them, anything else is a spy win. */
export function tallyFinalVotes(state: InfiltratorState): InfiltratorState {
  assert(state.phase === 'voting', 'There is no final vote to tally.');
  const round = requireRound(state);
  const counts = new Map<string, number>();
  for (const suspect of Object.values(round.finalVotes)) counts.set(suspect, (counts.get(suspect) ?? 0) + 1);

  let top: string | null = null;
  let topCount = 0;
  let tie = false;
  for (const [id, n] of counts) {
    if (n > topCount) {
      top = id;
      topCount = n;
      tie = false;
    } else if (n === topCount) {
      tie = true;
    }
  }

  const caught = !tie && top === round.spyId;
  return finish(state, {
    winner: caught ? 'agents' : 'spy',
    reason: caught ? 'caught' : 'timeUp',
    accusedId: !tie && top ? top : undefined,
  });
}

/** Drop a participant who left mid-round. If it was the spy, the agents win by default. */
export function removeParticipant(state: InfiltratorState, playerId: string): InfiltratorState {
  const round = state.round;
  if (!round || state.phase === 'ended' || state.phase === 'lobby') return state;
  if (!isParticipant(round, playerId)) return state;

  if (playerId === round.spyId) return finish(state, { winner: 'agents', reason: 'spyLeft' });

  const participantIds = round.participantIds.filter((id) => id !== playerId);
  const finalVotes = Object.fromEntries(
    Object.entries(round.finalVotes).filter(([voter, suspect]) => voter !== playerId && suspect !== playerId),
  );
  let accusation = round.accusation;
  if (accusation && (accusation.accusedId === playerId || accusation.accuserId === playerId)) accusation = null;
  else if (accusation) accusation = { ...accusation, votes: omit(accusation.votes, playerId) };

  let next: InfiltratorState = { ...state, round: { ...round, participantIds, finalVotes, accusation } };
  if (participantIds.length < 2) return finish(next, { winner: 'spy', reason: 'timeUp' });

  if (next.phase === 'voting' && participantIds.every((id) => id in finalVotes)) return tallyFinalVotes(next);
  if (next.phase === 'playing' && accusation) {
    // The departed player may have been the last holdout.
    const voters = participantIds.filter((id) => id !== accusation!.accusedId);
    if (voters.every((id) => accusation!.votes[id])) {
      const caught = accusation.accusedId === round.spyId;
      return finish(next, {
        winner: caught ? 'agents' : 'spy',
        reason: caught ? 'caught' : 'wrongAccusation',
        accusedId: accusation.accusedId,
        accuserId: accusation.accuserId,
      });
    }
  }
  return next;
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = obj;
  return rest;
}

/**
 * Scoring (as in the board game):
 *  - Spy wins: 2 points; 4 if an innocent was convicted or the spy guessed the location.
 *  - Agents win: 1 point each non-spy; the successful accuser gets 1 extra.
 */
function finish(state: InfiltratorState, result: RoundResult): InfiltratorState {
  const round = requireRound(state);
  const scores = { ...state.scores };
  if (result.winner === 'spy') {
    const bonus = result.reason === 'wrongAccusation' || result.reason === 'spyGuessedRight';
    scores[round.spyId] = (scores[round.spyId] ?? 0) + (bonus ? 4 : 2);
  } else {
    for (const id of round.participantIds) {
      if (id === round.spyId) continue;
      scores[id] = (scores[id] ?? 0) + 1;
    }
    if (result.reason === 'caught' && result.accuserId) {
      scores[result.accuserId] = (scores[result.accuserId] ?? 0) + 1;
    }
  }
  return {
    ...state,
    phase: 'ended',
    round: { ...round, accusation: null, result },
    scores,
    roundsPlayed: state.roundsPlayed + 1,
  };
}

/** Back to the lobby and wipe scores. */
export function reset(): InfiltratorState {
  return initialState();
}

export function viewFor(state: InfiltratorState, playerId: string, now: number): InfiltratorView {
  const round = state.round;
  const ended = state.phase === 'ended';
  let roundView: InfiltratorView['round'] = null;
  if (round) {
    const isSpy = round.spyId === playerId;
    roundView = {
      ...round,
      isSpy,
      role: isSpy ? null : (round.roles[playerId] ?? null),
      location: isSpy && !ended ? null : round.location,
      spyId: ended ? round.spyId : null,
      roles: ended ? round.roles : null,
    };
  }
  return {
    phase: state.phase,
    settings: state.settings,
    round: roundView,
    scores: state.scores,
    roundsPlayed: state.roundsPlayed,
    locations: LOCATION_NAMES.slice(),
    serverNow: now,
  };
}
