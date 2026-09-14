import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import {
  DEFAULT_DAY_SECONDS,
  MAX_DAY_SECONDS,
  MAX_PLAYERS,
  MIN_DAY_SECONDS,
  MAX_NIGHT_SECONDS,
  MIN_NIGHT_SECONDS,
  MIN_PLAYERS,
  MIN_VOTE_LOCK_SECONDS,
  NIGHT_ORDER,
  NIGHT_SECONDS,
  VOTE_LOCK_SECONDS,
  maxVoteLockFor,
  ROLE_INFO,
  type LogEntry,
  type NightfallSettings,
  type NightfallState,
  type NightfallView,
  type Role,
  type RoleCounts,
  type Team,
} from './types.js';

export type Rng = () => number;

export class NightfallError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new NightfallError(message);
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

/** How many of each role a table of `n` players gets. */
export function roleCounts(n: number): RoleCounts {
  const shade = n <= 6 ? 1 : n <= 9 ? 2 : 3;
  const oracle = 1;
  const healer = n >= 5 ? 1 : 0;
  return { shade, oracle, healer, townsfolk: Math.max(0, n - shade - oracle - healer) };
}

export function initialState(): NightfallState {
  return {
    phase: 'lobby',
    settings: {
      nightSeconds: NIGHT_SECONDS,
      voteLockSeconds: VOTE_LOCK_SECONDS,
      daySeconds: DEFAULT_DAY_SECONDS,
      hostCanCallVote: true,
    },
    dayNumber: 0,
    participantIds: [],
    roles: {},
    alive: {},
    left: [],
    night: null,
    day: null,
    lastNight: null,
    oracleResults: {},
    lastProtected: {},
    log: [],
    winner: null,
  };
}

/** A partial update: only the fields the host actually changed. */
export type SettingsPatch = Partial<NightfallSettings>;

export function setSettings(state: NightfallState, patch: SettingsPatch): NightfallState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'Settings can only change between games.');

  const next = { ...state.settings };

  if (patch.daySeconds !== undefined) {
    assert(
      Number.isInteger(patch.daySeconds) && patch.daySeconds >= MIN_DAY_SECONDS && patch.daySeconds <= MAX_DAY_SECONDS,
      `Day length must be between ${MIN_DAY_SECONDS} and ${MAX_DAY_SECONDS} seconds.`,
    );
    next.daySeconds = patch.daySeconds;
  }

  if (patch.nightSeconds !== undefined) {
    assert(
      Number.isInteger(patch.nightSeconds) &&
        patch.nightSeconds >= MIN_NIGHT_SECONDS &&
        patch.nightSeconds <= MAX_NIGHT_SECONDS,
      `Each role's turn must be between ${MIN_NIGHT_SECONDS} and ${MAX_NIGHT_SECONDS} seconds.`,
    );
    next.nightSeconds = patch.nightSeconds;
  }

  if (patch.voteLockSeconds !== undefined) {
    assert(
      Number.isInteger(patch.voteLockSeconds) && patch.voteLockSeconds >= MIN_VOTE_LOCK_SECONDS,
      `The discussion lock cannot be negative.`,
    );
    next.voteLockSeconds = patch.voteLockSeconds;
  }

  if (patch.hostCanCallVote !== undefined) {
    assert(typeof patch.hostCanCallVote === 'boolean', 'Invalid setting.');
    next.hostCanCallVote = patch.hostCanCallVote;
  }

  /*
   * The lock and the day are validated together, because the limit on one
   * depends on the other. A 2-minute lock inside a 1-minute day would mean
   * voting never opens at all.
   */
  const lockCap = maxVoteLockFor(next.daySeconds);
  if (patch.voteLockSeconds !== undefined) {
    // The host set the lock explicitly: tell them why it will not fit.
    assert(
      next.voteLockSeconds <= lockCap,
      `With a ${Math.round(next.daySeconds / 60)} minute day the discussion can be at most ${lockCap} seconds, ` +
        `so there is still time to vote.`,
    );
  } else if (next.voteLockSeconds > lockCap) {
    // The day was shortened under an already-set lock: trim it to fit rather
    // than rejecting a change the host did not make.
    next.voteLockSeconds = lockCap;
  }

  return { ...state, settings: next };
}

/** Deal roles to the participants and fall into the first night. */
export function startGame(state: NightfallState, participants: BasePlayer[], now: number, rng: Rng = Math.random): NightfallState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'A game is already in progress.');
  assert(participants.length >= MIN_PLAYERS, `Nightfall needs at least ${MIN_PLAYERS} players.`);
  assert(participants.length <= MAX_PLAYERS, `Nightfall supports at most ${MAX_PLAYERS} players.`);

  const counts = roleCounts(participants.length);
  const deck: Role[] = [
    ...Array<Role>(counts.shade).fill('shade'),
    ...Array<Role>(counts.oracle).fill('oracle'),
    ...Array<Role>(counts.healer).fill('healer'),
    ...Array<Role>(counts.townsfolk).fill('townsfolk'),
  ];
  const dealt = shuffle(deck, rng);
  const roles: Record<string, Role> = {};
  const alive: Record<string, boolean> = {};
  participants.forEach((p, i) => {
    roles[p.id] = dealt[i];
    alive[p.id] = true;
  });

  const fresh: NightfallState = {
    ...initialState(),
    settings: state.settings,
    participantIds: participants.map((p) => p.id),
    roles,
    alive,
    log: [{ kind: 'start', playerCount: participants.length }],
  };
  return beginNight(fresh, now);
}

/** Back to the lobby. */
export function reset(state: NightfallState): NightfallState {
  return { ...initialState(), settings: state.settings };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function isAlive(state: NightfallState, id: string): boolean {
  return state.alive[id] === true;
}

export function living(state: NightfallState): string[] {
  return state.participantIds.filter((id) => isAlive(state, id));
}

export function livingWithRole(state: NightfallState, role: Role): string[] {
  return living(state).filter((id) => state.roles[id] === role);
}

export function teamOf(role: Role): Team {
  return ROLE_INFO[role].team;
}

/** Living players who still owe a night action. */
export function pendingNightActors(state: NightfallState): string[] {
  const night = state.night;
  if (!night) return [];
  return living(state).filter((id) => state.roles[id] !== 'townsfolk' && !night.ready.includes(id));
}

/**
 * Which ROLES still owe a decision tonight, in wake order.
 *
 * A role is one actor, not a queue of players. The Shades in particular decide
 * as a coven, so the night waits on "the Shades" until every living Shade has
 * locked in — it must never count down from "2 Shades" to "1 Shade" as they
 * ready one by one. That would read as though the game were waiting on players
 * rather than roles, and it would leak the size of the coven to the whole table.
 */
export function pendingNightRoles(state: NightfallState): Role[] {
  const night = state.night;
  if (!night) return [];
  return NIGHT_ORDER.filter((role) => {
    const holders = living(state).filter((id) => state.roles[id] === role);
    return holders.length > 0 && holders.some((id) => !night.ready.includes(id));
  });
}

/**
 * What a Shade's fellow Shades have picked tonight. The coven acts as a team
 * and the target is decided by plurality, so they need to see each other's
 * choices to coordinate. Nobody else ever receives this.
 */
export function allyPicksFor(
  state: NightfallState,
  playerId: string,
): { shadeId: string; targetId: string; ready: boolean }[] {
  const night = state.night;
  if (!night || state.phase !== 'night') return [];
  if (state.roles[playerId] !== 'shade' || !isAlive(state, playerId)) return [];
  return living(state)
    .filter((id) => id !== playerId && state.roles[id] === 'shade' && id in night.shadePicks)
    .map((shadeId) => ({
      shadeId,
      targetId: night.shadePicks[shadeId],
      ready: night.ready.includes(shadeId),
    }));
}

/** True once this actor has locked tonight's pick in. */
export function isNightReady(state: NightfallState, id: string): boolean {
  return !!state.night?.ready.includes(id);
}

export function hasNightAction(state: NightfallState, id: string): boolean {
  return isAlive(state, id) && state.roles[id] !== 'townsfolk';
}

/** Who `id` may target tonight, given their role. */
export function eligibleTargets(state: NightfallState, id: string): string[] {
  if (state.phase !== 'night' || !hasNightAction(state, id)) return [];
  const role = state.roles[id];
  const alive = living(state);
  if (role === 'shade') return alive.filter((t) => state.roles[t] !== 'shade');
  if (role === 'oracle') return alive.filter((t) => t !== id);
  if (role === 'healer') return alive.filter((t) => t !== state.lastProtected[id]);
  return [];
}

/** A player's pick for tonight. Provisional until they press Ready. */
export function nightPickOf(state: NightfallState, id: string): string | null {
  const night = state.night;
  if (!night) return null;
  const role = state.roles[id];
  if (role === 'shade') return night.shadePicks[id] ?? null;
  if (role === 'oracle') return night.oraclePicks[id] ?? null;
  if (role === 'healer') return night.healerPicks[id] ?? null;
  return null;
}

export function isNightTimeUp(state: NightfallState, now: number): boolean {
  return state.phase === 'night' && !!state.night && now >= state.night.endsAt;
}

/**
 * The waking role ran out of time. Skip it — everyone who did not lock in
 * simply forfeits tonight's action — and hand the clock to the next role.
 * Only when no role is left does the night actually resolve.
 */
export function skipNightTurn(state: NightfallState, now: number): NightfallState {
  assert(state.phase === 'night' && state.night, 'It is not night.');
  const night = state.night;
  const turn = night.turn;
  if (turn === null) return resolveNight(state, now);

  // Mark every living holder of this role ready, so the turn can move past them.
  const stalled = living(state).filter((id) => state.roles[id] === turn && !night.ready.includes(id));
  const skipped: NightfallState = {
    ...state,
    night: { ...night, ready: [...night.ready, ...stalled] },
  };
  const next = advanceNightTurn(skipped, now);
  return next.night!.turn === null ? resolveNight(next, now) : next;
}

export function isDayTimeUp(state: NightfallState, now: number): boolean {
  return state.phase === 'day' && !!state.day && now >= state.day.endsAt;
}

/** Wall-clock at which the current phase auto-resolves, or null. */
export function phaseEndsAt(state: NightfallState): number | null {
  if (state.phase === 'night' && state.night) return state.night.endsAt;
  if (state.phase === 'day' && state.day) return state.day.endsAt;
  return null;
}

/* ------------------------------------------------------------------ */
/* Night                                                               */
/* ------------------------------------------------------------------ */

function beginNight(state: NightfallState, now: number): NightfallState {
  const number = state.dayNumber + 1;
  const base: NightfallState = {
    ...state,
    phase: 'night',
    dayNumber: number,
    day: null,
    night: {
      number,
      endsAt: now + state.settings.nightSeconds * 1000,
      shadePicks: {},
      shadeOrder: [],
      oraclePicks: {},
      healerPicks: {},
      ready: [],
      turn: null,
    },
  };
  const next = advanceNightTurn(base, now);
  // Nobody with a night action left alive would stall the night; resolve at once.
  return next.night!.turn === null ? resolveNight(next, now) : next;
}

/**
 * The next role that still owes a decision, in NIGHT_ORDER. Roles with no
 * living holder are skipped entirely, so a dead Healer never stalls the night.
 */
/**
 * Pass the night to the next waking role and restart the clock for them.
 *
 * Each role gets its own NIGHT_SECONDS. Every transition goes through here so
 * the deadline can never be left holding the previous role's value — which is
 * what made all three roles share a single 60s budget.
 */
export function advanceNightTurn(state: NightfallState, now: number): NightfallState {
  const night = state.night;
  if (!night) return state;
  const turn = nextNightTurn(state);
  if (turn === null) return { ...state, night: { ...night, turn } };
  // A fresh minute for whoever just woke up.
  return { ...state, night: { ...night, turn, endsAt: now + state.settings.nightSeconds * 1000 } };
}

export function nextNightTurn(state: NightfallState): Role | null {
  const night = state.night;
  if (!night) return null;
  for (const role of NIGHT_ORDER) {
    const holders = living(state).filter((id) => state.roles[id] === role);
    if (holders.length === 0) continue;
    if (holders.some((id) => !night.ready.includes(id))) return role;
  }
  return null;
}

/** Submit (or change) a night action. Resolves the night once everyone has acted. */
export function nightAction(state: NightfallState, actorId: string, targetId: string, now: number): NightfallState {
  assert(state.phase === 'night' && state.night, 'It is not night.');
  assert(state.participantIds.includes(actorId), 'You are not in this game.');
  assert(isAlive(state, actorId), 'The dead do not stir at night.');
  const role = state.roles[actorId];
  assert(role !== 'townsfolk', 'You have no night action. Sleep tight.');
  assert(state.night.turn === role, 'It is not your turn yet. Wait your turn.');
  assert(isAlive(state, targetId), 'That player is not alive.');
  const allowed = eligibleTargets(state, actorId);
  if (role === 'shade') assert(allowed.includes(targetId), 'Shades cannot target a fellow Shade.');
  else if (role === 'oracle') assert(allowed.includes(targetId), 'You already know your own allegiance.');
  else assert(allowed.includes(targetId), 'You cannot protect the same player two nights in a row.');

  const night = state.night;
  let updated = night;
  if (role === 'shade') {
    updated = {
      ...night,
      shadePicks: { ...night.shadePicks, [actorId]: targetId },
      shadeOrder: [...night.shadeOrder.filter((id) => id !== actorId), actorId],
    };
  } else if (role === 'oracle') {
    updated = { ...night, oraclePicks: { ...night.oraclePicks, [actorId]: targetId } };
  } else {
    updated = { ...night, healerPicks: { ...night.healerPicks, [actorId]: targetId } };
  }
  assert(!night.ready.includes(actorId), 'Your choice is locked in for tonight.');
  // A pick is provisional: only pressing Ready commits it and can end the night.
  return { ...state, night: updated };
}

/** Lock tonight's pick in. The night resolves once every actor is ready. */
export function nightReady(state: NightfallState, actorId: string, now: number): NightfallState {
  assert(state.phase === 'night' && state.night, 'It is not night.');
  assert(state.participantIds.includes(actorId), 'You are not in this game.');
  assert(isAlive(state, actorId), 'The dead do not stir at night.');
  const role = state.roles[actorId];
  assert(role !== 'townsfolk', 'You have no night action. Sleep tight.');
  assert(state.night.turn === role, 'It is not your turn yet. Wait your turn.');
  assert(!state.night.ready.includes(actorId), 'You are already ready.');
  assert(nightPickOf(state, actorId) !== null, 'Choose someone first.');

  const readied: NightfallState = {
    ...state,
    night: { ...state.night, ready: [...state.night.ready, actorId] },
  };
  // Hand the night to the next role, with a fresh clock, once this one is done.
  const next = advanceNightTurn(readied, now);
  return next.night!.turn === null ? resolveNight(next, now) : next;
}

/** The Shades' victim: plurality of picks, earliest submitted breaking ties; null if no valid pick. */
export function shadeTarget(state: NightfallState): string | null {
  const night = state.night;
  if (!night) return null;
  const counts = new Map<string, number>();
  for (const shadeId of night.shadeOrder) {
    if (!isAlive(state, shadeId)) continue;
    const target = night.shadePicks[shadeId];
    if (!target || !isAlive(state, target) || state.roles[target] === 'shade') continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}

/** Apply the night: healer saves, shades kill, oracle learns. Then check for a winner or start the day. */
export function resolveNight(state: NightfallState, now: number): NightfallState {
  assert(state.phase === 'night' && state.night, 'It is not night.');
  const night = state.night;

  const protectedIds = new Set(
    Object.entries(night.healerPicks)
      .filter(([healerId]) => isAlive(state, healerId))
      .map(([, target]) => target),
  );
  const target = shadeTarget(state);
  const saved = target !== null && protectedIds.has(target);
  const killedId = target !== null && !saved ? target : null;

  const alive = { ...state.alive };
  if (killedId) alive[killedId] = false;

  const oracleResults = { ...state.oracleResults };
  const log: LogEntry[] = [...state.log];
  for (const [oracleId, inspected] of Object.entries(night.oraclePicks)) {
    if (!isAlive(state, oracleId)) continue;
    const isShade = state.roles[inspected] === 'shade';
    oracleResults[oracleId] = [...(oracleResults[oracleId] ?? []), { night: night.number, targetId: inspected, isShade }];
    log.push({ kind: 'oracle', night: night.number, oracleId, targetId: inspected, isShade });
  }

  const lastProtected = { ...state.lastProtected };
  for (const id of livingWithRole(state, 'healer')) lastProtected[id] = night.healerPicks[id] ?? null;

  log.push({ kind: 'night', night: night.number, killedId, saved });

  const next: NightfallState = {
    ...state,
    alive,
    night: null,
    lastNight: { number: night.number, killedId, saved },
    oracleResults,
    lastProtected,
    log,
  };
  return checkWin(next) ?? beginDay(next, now);
}

/* ------------------------------------------------------------------ */
/* Day                                                                 */
/* ------------------------------------------------------------------ */

function beginDay(state: NightfallState, now: number): NightfallState {
  return {
    ...state,
    phase: 'day',
    night: null,
    day: {
        number: state.dayNumber,
        endsAt: now + state.settings.daySeconds * 1000,
        votesOpenAt: now + state.settings.voteLockSeconds * 1000,
        votes: {},
      },
  };
}

/** Cast or change a vote. `targetId` null means "skip". Resolves when every living player has voted. */
export function vote(state: NightfallState, voterId: string, targetId: string | null, now: number): NightfallState {
  assert(state.phase === 'day' && state.day, 'It is not day.');
  assert(state.participantIds.includes(voterId), 'You are not in this game.');
  assert(isAlive(state, voterId), 'The dead do not vote.');
  assert(now >= state.day.votesOpenAt, 'Voting is not open yet. Talk it over first.');
  if (targetId !== null) {
    assert(isAlive(state, targetId), 'That player is not alive.');
    assert(targetId !== voterId, 'You cannot vote to banish yourself.');
  }
  const next: NightfallState = { ...state, day: { ...state.day, votes: { ...state.day.votes, [voterId]: targetId } } };
  return everyoneVoted(next) ? resolveDay(next, now) : next;
}

export function everyoneVoted(state: NightfallState): boolean {
  if (!state.day) return false;
  const votes = state.day.votes;
  return living(state).every((id) => id in votes);
}

/** Tally the votes; the outcome and any reveal land in the log. Then check for a winner or fall into night. */
export function resolveDay(state: NightfallState, now: number): NightfallState {
  assert(state.phase === 'day' && state.day, 'It is not day.');
  const day = state.day;
  const votes: Record<string, string | null> = {};
  for (const [voter, target] of Object.entries(day.votes)) {
    if (!isAlive(state, voter)) continue;
    if (target !== null && !isAlive(state, target)) continue;
    votes[voter] = target;
  }

  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) {
    const key = target ?? 'skip';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top: string | null = null;
  let topCount = 0;
  let tie = false;
  for (const [key, n] of counts) {
    if (n > topCount) {
      top = key;
      topCount = n;
      tie = false;
    } else if (n === topCount) {
      tie = true;
    }
  }

  let banishedId: string | null = null;
  let reason: 'plurality' | 'tie' | 'skip' | 'noVotes';
  if (counts.size === 0) reason = 'noVotes';
  else if (tie) reason = 'tie';
  else if (top === 'skip') reason = 'skip';
  else {
    reason = 'plurality';
    banishedId = top;
  }

  const alive = { ...state.alive };
  if (banishedId) alive[banishedId] = false;
  const log: LogEntry[] = [
    ...state.log,
    { kind: 'banish', day: day.number, banishedId, role: banishedId ? state.roles[banishedId] : null, reason, votes },
  ];
  const next: NightfallState = { ...state, alive, day: { ...day, votes }, log };
  return checkWin(next) ?? beginNight({ ...next, day: null }, now);
}

/* ------------------------------------------------------------------ */
/* Win + leavers                                                       */
/* ------------------------------------------------------------------ */

export function winnerOf(state: NightfallState): Team | null {
  if (state.participantIds.length === 0) return null;
  const alive = living(state);
  const shades = alive.filter((id) => state.roles[id] === 'shade').length;
  if (shades === 0) return 'town';
  if (shades >= alive.length - shades) return 'shades';
  return null;
}

function checkWin(state: NightfallState): NightfallState | null {
  const winner = winnerOf(state);
  if (!winner) return null;
  return { ...state, phase: 'ended', night: null, day: null, winner, log: [...state.log, { kind: 'win', winner }] };
}

/** A participant left the room: they count as dead. Re-check the win and whether the phase can resolve. */
export function removePlayer(state: NightfallState, playerId: string, now: number): NightfallState {
  if (!state.participantIds.includes(playerId)) return state;
  if (state.phase === 'lobby' || state.phase === 'ended') return state;
  if (!isAlive(state, playerId)) {
    return state.left.includes(playerId) ? state : { ...state, left: [...state.left, playerId] };
  }

  let next: NightfallState = {
    ...state,
    alive: { ...state.alive, [playerId]: false },
    left: [...state.left, playerId],
    log: [...state.log, { kind: 'left', playerId }],
  };
  const won = checkWin(next);
  if (won) return won;

  if (next.phase === 'night' && next.night) {
    const night = next.night;
    next = {
      ...next,
      night: {
        ...night,
        shadePicks: omit(night.shadePicks, playerId),
        shadeOrder: night.shadeOrder.filter((id) => id !== playerId),
        oraclePicks: omit(night.oraclePicks, playerId),
        healerPicks: omit(night.healerPicks, playerId),
        ready: night.ready.filter((id) => id !== playerId),
      },
    };
    /*
     * If the departing player was the last holder of the awake role, the turn
     * has to move on or the night would stall until the timer fires.
     */
    next = advanceNightTurn(next, now);
    if (next.night!.turn === null) return resolveNight(next, now);
    return next;
  }
  if (next.phase === 'day' && next.day) {
    const votes: Record<string, string | null> = {};
    for (const [voter, target] of Object.entries(next.day.votes)) {
      if (voter === playerId || target === playerId) continue;
      votes[voter] = target;
    }
    next = { ...next, day: { ...next.day, votes } };
    if (everyoneVoted(next)) return resolveDay(next, now);
    return next;
  }
  return next;
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = obj;
  return rest;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export function viewFor(state: NightfallState, playerId: string, now: number): NightfallView {
  const participant = state.participantIds.includes(playerId);
  const role = participant ? state.roles[playerId] : null;
  const alive = participant && isAlive(state, playerId);
  const ended = state.phase === 'ended';
  const seesAll = ended || (participant && !alive);

  const revealedRoles: Record<string, Role> = {};
  for (const id of state.participantIds) {
    const r = state.roles[id];
    if (seesAll) revealedRoles[id] = r;
    else if (id === playerId && role) revealedRoles[id] = r;
    else if (!isAlive(state, id) && !state.left.includes(id)) revealedRoles[id] = r;
    else if (role === 'shade' && r === 'shade') revealedRoles[id] = r;
  }

  const log = state.log.filter((e) => e.kind !== 'oracle' || seesAll || e.oracleId === playerId);

  return {
    phase: state.phase,
    settings: state.settings,
    dayNumber: state.dayNumber,
    participantIds: state.participantIds,
    alive: state.alive,
    left: state.left,
    revealedRoles,
    you: {
      participant,
      role,
      alive,
      hasNightAction: state.phase === 'night' && hasNightAction(state, playerId),
      nightPick: nightPickOf(state, playerId),
      nightReady: isNightReady(state, playerId),
      yourTurn: state.phase === 'night' && !!role && state.night?.turn === role && alive,
      oracleResults: state.oracleResults[playerId] ?? [],
      lastProtected: state.lastProtected[playerId] ?? null,
      eligibleTargets: eligibleTargets(state, playerId),
      allyPicks: allyPicksFor(state, playerId),
    },
    night: state.night
      ? {
          number: state.night.number,
          endsAt: state.night.endsAt,
          turn: state.night.turn,
          pendingRoles: pendingNightRoles(state),
        }
      : null,
    day: state.day,
    lastNight: state.lastNight,
    log,
    winner: state.winner,
    serverNow: now,
  };
}
