import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import {
  eligibleTargets,
  initialState,
  isDayTimeUp,
  isNightTimeUp,
  nightAction,
  nightReady,
  nightPickOf,
  pendingNightActors,
  pendingNightRoles,
  removePlayer,
  reset,
  resolveDay,
  resolveNight,
  roleCounts,
  setSettings,
  shadeTarget,
  skipNightTurn,
  startGame,
  viewFor,
  vote,
  winnerOf,
} from './logic.js';
import { DEFAULT_DAY_SECONDS, NIGHT_SECONDS, maxVoteLockFor, type NightfallState, type Role } from './types.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const T0 = 1_000_000;

/**
 * Pick a target and immediately lock it in. Picking is provisional, so tests
 * that mean "this actor has committed" use this rather than nightAction.
 *
 * Roles now wake in order, so acting out of turn is rejected. Tests care about
 * outcomes rather than the order they type their calls in, so this fast-forwards
 * the night to the actor's role by having every earlier role act first. Those
 * filler picks are deliberately arbitrary; a test that cares about them makes
 * them explicitly.
 */
function act(state: NightfallState, actorId: string, targetId: string, now = T0): NightfallState {
  let s = state;
  const role = s.roles[actorId];
  // Let any role that wakes before this one finish, so the turn reaches us.
  while (s.phase === 'night' && s.night && s.night.turn !== null && s.night.turn !== role) {
    const waiting = pendingNightActors(s).filter((id) => s.roles[id] === s.night!.turn);
    if (waiting.length === 0) break;
    for (const id of waiting) {
      const options = eligibleTargets(s, id);
      if (options.length === 0) break;
      s = nightReady(nightAction(s, id, options[0], now), id, now);
      if (s.phase !== 'night') return s; // the night resolved early
    }
  }
  return nightReady(nightAction(s, actorId, targetId, now), actorId, now);
}

/** Advance the night so `role` is the one awake, without committing it. */
function turnFor(state: NightfallState, role: Role): NightfallState {
  let s = state;
  while (s.phase === 'night' && s.night && s.night.turn !== null && s.night.turn !== role) {
    const waiting = pendingNightActors(s).filter((id) => s.roles[id] === s.night!.turn);
    if (waiting.length === 0) break;
    for (const id of waiting) {
      const options = eligibleTargets(s, id);
      if (options.length === 0) break;
      s = nightReady(nightAction(s, id, options[0], now_(s)), id, now_(s));
      if (s.phase !== 'night') return s;
    }
  }
  return s;
}

const now_ = (_s: NightfallState) => T0;

/**
 * The day opens with a short discussion lock, so every vote in these tests is
 * cast after it lifts. `dayNow` is a time safely past the lock.
 */
function dayNow(state: NightfallState): number {
  return (state.day?.votesOpenAt ?? T0) + 1;
}

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
const players = (n: number): BasePlayer[] => ids.slice(0, n).map((id) => ({ id, name: id.toUpperCase(), connected: true }));

/** Start a game then pin the roles so tests are deterministic (a=shade, b=oracle, c=healer, rest townsfolk unless given). */
function setup(n: number, roles?: Partial<Record<string, Role>>): NightfallState {
  const s = startGame(initialState(), players(n), T0, seeded());
  const fixed: Record<string, Role> = {};
  for (const id of s.participantIds) fixed[id] = roles?.[id] ?? 'townsfolk';
  if (!roles) {
    fixed.a = 'shade';
    fixed.b = 'oracle';
    if (n >= 5) fixed.c = 'healer';
  }
  return { ...s, roles: fixed };
}

describe('roleCounts', () => {
  it('scales shades with the table and adds a healer from 5 players', () => {
    expect(roleCounts(4)).toEqual({ shade: 1, oracle: 1, healer: 0, townsfolk: 2 });
    expect(roleCounts(5)).toEqual({ shade: 1, oracle: 1, healer: 1, townsfolk: 2 });
    expect(roleCounts(6)).toEqual({ shade: 1, oracle: 1, healer: 1, townsfolk: 3 });
    expect(roleCounts(7)).toEqual({ shade: 2, oracle: 1, healer: 1, townsfolk: 3 });
    expect(roleCounts(9)).toEqual({ shade: 2, oracle: 1, healer: 1, townsfolk: 5 });
    expect(roleCounts(10)).toEqual({ shade: 3, oracle: 1, healer: 1, townsfolk: 5 });
    expect(roleCounts(12)).toEqual({ shade: 3, oracle: 1, healer: 1, townsfolk: 7 });
  });
});

describe('startGame', () => {
  it('deals exactly the expected roles and opens night 1', () => {
    for (const n of [4, 5, 7, 10, 12]) {
      const s = startGame(initialState(), players(n), T0, seeded(n));
      const tally: Record<string, number> = {};
      for (const r of Object.values(s.roles)) tally[r] = (tally[r] ?? 0) + 1;
      const want = roleCounts(n);
      expect(tally.shade).toBe(want.shade);
      expect(tally.oracle).toBe(1);
      expect(tally.healer ?? 0).toBe(want.healer);
      expect(tally.townsfolk ?? 0).toBe(want.townsfolk);
      expect(s.phase).toBe('night');
      expect(s.dayNumber).toBe(1);
      expect(s.night?.endsAt).toBe(T0 + NIGHT_SECONDS * 1000);
      expect(Object.values(s.alive).every(Boolean)).toBe(true);
    }
  });

  it('refuses fewer than 4 players and a running game', () => {
    expect(() => startGame(initialState(), players(3), T0)).toThrow(/at least 4/);
    const s = startGame(initialState(), players(4), T0);
    expect(() => startGame(s, players(4), T0)).toThrow(/already in progress/);
  });

  it('validates the day length setting', () => {
    expect(setSettings(initialState(), { daySeconds: 60 }).settings.daySeconds).toBe(60);
    expect(setSettings(initialState(), { daySeconds: 600 }).settings.daySeconds).toBe(600);
    expect(() => setSettings(initialState(), { daySeconds: 30 })).toThrow();
    expect(() => setSettings(initialState(), { daySeconds: 601 })).toThrow();
    expect(() => setSettings(startGame(initialState(), players(4), T0), { daySeconds: 120 })).toThrow();

    // The night turn and the discussion lock are settings too.
    expect(setSettings(initialState(), { nightSeconds: 30 }).settings.nightSeconds).toBe(30);
    expect(() => setSettings(initialState(), { nightSeconds: 5 })).toThrow(/turn must be between/);
    expect(() => setSettings(initialState(), { nightSeconds: 999 })).toThrow(/turn must be between/);
    expect(setSettings(initialState(), { voteLockSeconds: 0 }).settings.voteLockSeconds).toBe(0);
    // 200s cannot fit in the default 3 minute day; the error names the real cap.
    expect(() => setSettings(initialState(), { voteLockSeconds: 200 })).toThrow(/at most/);

    // A patch only touches what it names.
    const both = setSettings(initialState(), { nightSeconds: 45, hostCanCallVote: false });
    expect(both.settings.nightSeconds).toBe(45);
    expect(both.settings.hostCanCallVote).toBe(false);
    expect(both.settings.daySeconds).toBe(DEFAULT_DAY_SECONDS);
  });
});

describe('night actions', () => {
  it('rejects townsfolk, the dead, self-inspection and shade-on-shade', () => {
    const s = setup(7, { a: 'shade', b: 'shade', c: 'oracle', d: 'healer' });
    // Shades wake first, so shade rejections apply straight away.
    expect(() => nightAction(s, 'e', 'a', T0)).toThrow(/no night action/);
    expect(() => nightAction(s, 'a', 'b', T0)).toThrow(/fellow Shade/);
    expect(eligibleTargets(s, 'a')).toEqual(['c', 'd', 'e', 'f', 'g']);
    expect(eligibleTargets(s, 'e')).toEqual([]);
    const dead = { ...s, alive: { ...s.alive, a: false } };
    expect(() => nightAction(dead, 'a', 'c', T0)).toThrow(/dead/);
    // Acting before your role wakes is refused.
    expect(() => nightAction(s, 'c', 'd', T0)).toThrow(/not your turn/);
    // Once the oracle is awake, its own rule applies.
    const oracleTurn = turnFor(s, 'oracle');
    expect(oracleTurn.night?.turn).toBe('oracle');
    expect(() => nightAction(oracleTurn, 'c', 'c', T0)).toThrow(/own allegiance/);
  });

  it('kills the shade target when unprotected and moves to day', () => {
    let s = setup(5);
    s = act(s, 'a', 'd', T0 + 1);
    s = act(s, 'b', 'a', T0 + 2);
    expect(s.phase).toBe('night');
    expect(pendingNightActors(s)).toEqual(['c']);
    s = act(s, 'c', 'e', T0 + 3);
    expect(s.phase).toBe('day');
    expect(s.alive.d).toBe(false);
    expect(s.lastNight).toEqual({ number: 1, killedId: 'd', saved: false });
    expect(s.day?.endsAt).toBe(T0 + 3 + 180_000);
    expect(s.log.at(-1)).toMatchObject({ kind: 'night', night: 1, killedId: 'd' });
  });

  it('a protected target survives: a quiet night', () => {
    let s = setup(5);
    s = act(s, 'a', 'd', T0);
    s = act(s, 'b', 'e', T0);
    s = act(s, 'c', 'd', T0);
    expect(s.phase).toBe('day');
    expect(s.alive.d).toBe(true);
    expect(s.lastNight).toEqual({ number: 1, killedId: null, saved: true });
  });

  it('the healer may not protect the same player two nights running (but may self-protect)', () => {
    let s = setup(6);
    s = act(s, 'a', 'd', T0);
    s = act(s, 'b', 'e', T0);
    s = act(s, 'c', 'c', T0); // self-protect is fine
    expect(s.phase).toBe('day');
    expect(s.lastProtected.c).toBe('c');
    s = resolveDay(s, dayNow(s) + 10); // nobody voted -> nobody banished -> night 2
    expect(s.phase).toBe('night');
    expect(s.dayNumber).toBe(2);
    expect(eligibleTargets(s, 'c')).not.toContain('c');
    const healerTurn = turnFor(s, 'healer');
    expect(() => nightAction(healerTurn, 'c', 'c', T0 + 11)).toThrow(/two nights in a row/);
    // Pick without readying, so the night is still open to inspect.
    const picked = nightAction(healerTurn, 'c', 'e', T0 + 11);
    expect(picked.night?.healerPicks.c).toBe('e');
  });

  it('the oracle privately learns allegiance and accumulates results', () => {
    let s = setup(5);
    s = act(s, 'a', 'd', T0); // shade wakes first
    s = act(s, 'b', 'a', T0); // then the oracle inspects the shade
    s = act(s, 'c', 'c', T0); // then the healer wards themselves
    expect(s.oracleResults.b).toEqual([{ night: 1, targetId: 'a', isShade: true }]);
    const oracleView = viewFor(s, 'b', T0);
    expect(oracleView.you.oracleResults).toHaveLength(1);
    expect(oracleView.log.some((e) => e.kind === 'oracle')).toBe(true);
    const townView = viewFor(s, 'e', T0);
    expect(townView.you.oracleResults).toEqual([]);
    expect(townView.log.some((e) => e.kind === 'oracle')).toBe(false);
    // Dead players see everything, including the oracle's findings.
    const deadView = viewFor(s, 'd', T0);
    expect(deadView.log.some((e) => e.kind === 'oracle')).toBe(true);
    expect(deadView.revealedRoles).toEqual(s.roles);
  });

  it('shade plurality wins, ties go to the earliest submission, and timeouts skip missing actions', () => {
    let s = setup(10, { a: 'shade', b: 'shade', c: 'shade', d: 'oracle', e: 'healer' });
    s = act(s, 'b', 'g', T0 + 1);
    s = act(s, 'a', 'f', T0 + 2);
    // Pick without readying, so this shade can still change their mind below.
    s = nightAction(s, 'c', 'h', T0 + 3);
    expect(shadeTarget(s)).toBe('g'); // 1-1-1 tie -> earliest submitted
    s = act(s, 'c', 'f', T0 + 4); // switched to f, then locked in
    expect(shadeTarget(s)).toBe('f'); // 2 vs 1
    // With every shade ready the night has moved on to the oracle.
    expect(s.night?.turn).toBe('oracle');
    expect(() => nightAction(s, 'c', 'h', T0 + 5)).toThrow(/not your turn/);
    // The oracle's own minute started when the coven finished (T0 + 4).
    expect(isNightTimeUp(s, T0 + 60_000)).toBe(false);
    expect(isNightTimeUp(s, T0 + 4 + 60_000)).toBe(true);
    s = resolveNight(s, T0 + 64_000); // oracle and healer never acted
    expect(s.phase).toBe('day');
    expect(s.alive.f).toBe(false);
    expect(s.oracleResults.d).toBeUndefined();
    expect(s.lastProtected.e).toBeNull();
  });

  it('a pick is provisional until Ready, and Ready is what ends the night', () => {
    let s = setup(5, { a: 'shade', b: 'oracle', c: 'healer' });
    // The shade is awake first and can pick without resolving anything.
    expect(s.night?.turn).toBe('shade');
    s = nightAction(s, 'a', 'd', T0);
    expect(s.phase).toBe('night');
    expect(viewFor(s, 'a', T0).you.nightReady).toBe(false);
    expect(viewFor(s, 'a', T0).you.yourTurn).toBe(true);
    expect(viewFor(s, 'b', T0).you.yourTurn).toBe(false);

    // A provisional pick can be changed freely.
    s = nightAction(s, 'a', 'e', T0);
    expect(nightPickOf(s, 'a')).toBe('e');

    // Readying hands the night to the next role.
    s = nightReady(s, 'a', T0);
    expect(viewFor(s, 'a', T0).you.nightReady).toBe(true);
    expect(s.night?.turn).toBe('oracle');
    expect(s.phase).toBe('night');

    s = act(s, 'b', 'a', T0);
    expect(s.night?.turn).toBe('healer');
    expect(s.phase).toBe('night');

    // The last role readying resolves the night.
    s = nightAction(s, 'c', 'd', T0);
    s = nightReady(s, 'c', T0);
    expect(s.phase).toBe('day');
    expect(s.alive.e).toBe(false);
  });

  it('refuses Ready without a pick, twice over, or from the wrong player', () => {
    let s = setup(5, { a: 'shade', b: 'oracle', c: 'healer' });
    expect(() => nightReady(s, 'a', T0)).toThrow(/Choose someone first/);
    expect(() => nightReady(s, 'd', T0)).toThrow(/no night action/);
    // The oracle cannot ready before the shades are done.
    expect(() => nightReady(s, 'b', T0)).toThrow(/not your turn/);
    s = nightAction(s, 'a', 'd', T0);
    s = nightReady(s, 'a', T0);
    // The shade is now locked and the turn has moved on.
    expect(() => nightReady(s, 'a', T0)).toThrow(/not your turn/);
    expect(() => nightAction(s, 'a', 'e', T0)).toThrow(/not your turn/);
  });

  it('reports which roles are still deciding, without naming who', () => {
    let s = setup(6, { a: 'shade', b: 'oracle', c: 'healer' });
    expect(pendingNightRoles(s)).toEqual(['shade', 'oracle', 'healer']);

    s = act(s, 'a', 'd'); // shade done, oracle now awake
    expect(pendingNightRoles(s)).toEqual(['oracle', 'healer']);

    s = act(s, 'b', 'd'); // oracle done
    expect(pendingNightRoles(s)).toEqual(['healer']);

    // A townsfolk's view carries the same public list.
    expect(viewFor(s, 'e', T0).night?.pendingRoles).toEqual(['healer']);
  });

  it('treats a whole coven as one actor, never counting the Shades down', () => {
    // Three Shades: the night must wait on "the Shades" as a single role and
    // never reveal how many of them are still deciding.
    let s = setup(10, { a: 'shade', b: 'shade', c: 'shade', d: 'oracle', e: 'healer' });
    expect(pendingNightRoles(s)).toEqual(['shade', 'oracle', 'healer']);

    // One Shade locks in: still exactly one 'shade' entry, no count to leak.
    s = nightReady(nightAction(s, 'a', 'f', T0), 'a', T0);
    expect(pendingNightRoles(s)).toEqual(['shade', 'oracle', 'healer']);
    expect(s.night?.turn).toBe('shade');

    // A second Shade locks in: unchanged again.
    s = nightReady(nightAction(s, 'b', 'f', T0), 'b', T0);
    expect(pendingNightRoles(s)).toEqual(['shade', 'oracle', 'healer']);
    expect(s.night?.turn).toBe('shade');

    // Only when the LAST Shade is ready does the turn pass to the Oracle.
    s = nightReady(nightAction(s, 'c', 'f', T0), 'c', T0);
    expect(pendingNightRoles(s)).toEqual(['oracle', 'healer']);
    expect(s.night?.turn).toBe('oracle');

    // And a townsfolk never learns the size of the coven from any of it.
    const view = viewFor(s, 'g', T0).night;
    expect(view?.pendingRoles).toEqual(['oracle', 'healer']);
    expect(JSON.stringify(view)).not.toContain('count');
  });

  it('never reveals a living player role to another living player', () => {
    const s = setup(6, { a: 'shade', b: 'oracle', c: 'healer' });
    // A townsfolk knows only their own role.
    const folk = viewFor(s, 'e', T0);
    expect(Object.keys(folk.revealedRoles)).toEqual(['e']);
    // The oracle likewise, before inspecting anyone.
    const oracle = viewFor(s, 'b', T0);
    expect(Object.keys(oracle.revealedRoles)).toEqual(['b']);
    // The healer likewise.
    expect(Object.keys(viewFor(s, 'c', T0).revealedRoles)).toEqual(['c']);
    // A shade sees fellow shades and nobody else; here they are the only one.
    expect(Object.keys(viewFor(s, 'a', T0).revealedRoles)).toEqual(['a']);
  });

  it('shades see each other but no other living role', () => {
    const s = setup(9, { a: 'shade', b: 'shade', c: 'oracle', d: 'healer' });
    const seen = viewFor(s, 'a', T0).revealedRoles;
    expect(Object.keys(seen).sort()).toEqual(['a', 'b']);
    expect(seen.c).toBeUndefined();
    expect(seen.d).toBeUndefined();
  });

  it('shows a shade what the rest of the coven picked, and nobody else', () => {
    let s = setup(9, { a: 'shade', b: 'shade', c: 'oracle', d: 'healer' });

    // Before anyone picks, there is nothing to share.
    expect(viewFor(s, 'a', T0).you.allyPicks).toEqual([]);

    // Shade b picks provisionally; shade a can see it, flagged as not ready.
    s = nightAction(s, 'b', 'e', T0);
    const aView = viewFor(s, 'a', T0);
    expect(aView.you.allyPicks).toEqual([{ shadeId: 'b', targetId: 'e', ready: false }]);

    // Once b readies, a sees the same pick marked ready.
    s = nightReady(s, 'b', T0);
    expect(viewFor(s, 'a', T0).you.allyPicks).toEqual([{ shadeId: 'b', targetId: 'e', ready: true }]);

    // A shade never sees their own pick in the ally list.
    s = nightAction(s, 'a', 'f', T0);
    const own = viewFor(s, 'a', T0).you.allyPicks;
    expect(own.map((p) => p.shadeId)).toEqual(['b']);

    // No other role learns anything from it.
    expect(viewFor(s, 'c', T0).you.allyPicks).toEqual([]);
    expect(viewFor(s, 'd', T0).you.allyPicks).toEqual([]);
    expect(viewFor(s, 'e', T0).you.allyPicks).toEqual([]);
  });

  it('stops sharing coven picks with a dead shade', () => {
    let s = setup(9, { a: 'shade', b: 'shade', c: 'oracle', d: 'healer' });
    s = nightAction(s, 'b', 'e', T0);
    expect(viewFor(s, 'a', T0).you.allyPicks).toHaveLength(1);
    // A dead shade sees everything anyway via revealedRoles, but the live
    // coordination channel is for living shades only.
    const dead = { ...s, alive: { ...s.alive, a: false } };
    expect(viewFor(dead, 'a', T0).you.allyPicks).toEqual([]);
  });

  it('sends a dead player every role, so spectators can follow the game', () => {
    let s = setup(6, { a: 'shade', b: 'oracle', c: 'healer' });
    // Kill the oracle: they become a spectator.
    s = { ...s, alive: { ...s.alive, b: false } };
    const spectator = viewFor(s, 'b', T0);
    expect(Object.keys(spectator.revealedRoles).sort()).toEqual(s.participantIds.slice().sort());
    expect(spectator.revealedRoles.a).toBe('shade');
    expect(spectator.revealedRoles.c).toBe('healer');
    // And the living still see almost nothing.
    expect(Object.keys(viewFor(s, 'd', T0).revealedRoles).sort()).toEqual(['b', 'd']);
  });

  it('reveals every role to everyone once the game has ended', () => {
    let s = setup(4, { a: 'shade', b: 'oracle' });
    // Banish the only shade: the town wins and the game ends.
    s = act(s, 'a', 'c', T0);
    s = act(s, 'b', 'a', T0);
    const at = dayNow(s);
    s = vote(vote(vote(s, 'b', 'a', at), 'd', 'a', at), 'a', 'b', at);
    expect(s.phase).toBe('ended');
    // A survivor now sees the full table.
    const view = viewFor(s, 'd', T0);
    expect(Object.keys(view.revealedRoles).sort()).toEqual(s.participantIds.slice().sort());
  });

  it('gives every role its own clock instead of one shared night budget', () => {
    let s = setup(6, { a: 'shade', b: 'oracle', c: 'healer' });
    const shadeDeadline = s.night!.endsAt;
    expect(shadeDeadline).toBe(T0 + NIGHT_SECONDS * 1000);

    // The Shades take nearly their whole minute.
    const late = T0 + 55_000;
    s = nightReady(nightAction(s, 'a', 'd', late), 'a', late);
    expect(s.night?.turn).toBe('oracle');

    // The Oracle must get a FRESH minute, not the 5s the Shades left over.
    expect(s.night!.endsAt).toBe(late + NIGHT_SECONDS * 1000);
    expect(isNightTimeUp(s, shadeDeadline)).toBe(false);

    // And so does the Healer after them.
    const later = late + 50_000;
    s = nightReady(nightAction(s, 'b', 'd', later), 'b', later);
    expect(s.night?.turn).toBe('healer');
    expect(s.night!.endsAt).toBe(later + NIGHT_SECONDS * 1000);
  });

  it('a role that runs out of time is skipped, and the night carries on', () => {
    let s = setup(6, { a: 'shade', b: 'oracle', c: 'healer' });
    // The Shades never act: their minute expires.
    const out = s.night!.endsAt;
    expect(isNightTimeUp(s, out)).toBe(true);
    s = skipNightTurn(s, out);

    // The night is NOT over; it is simply the Oracle's turn now, with a new clock.
    expect(s.phase).toBe('night');
    expect(s.night?.turn).toBe('oracle');
    expect(s.night!.endsAt).toBe(out + NIGHT_SECONDS * 1000);

    // The Oracle acts, the Healer times out, and only then does dawn come.
    s = nightReady(nightAction(s, 'b', 'a', out + 1), 'b', out + 1);
    expect(s.night?.turn).toBe('healer');
    const healerOut = s.night!.endsAt;
    s = skipNightTurn(s, healerOut);
    expect(s.phase).toBe('day');
    // Nobody died: the shades forfeited their action by never choosing.
    expect(s.lastNight).toEqual({ number: 1, killedId: null, saved: false });
    expect(s.oracleResults.b).toHaveLength(1);
  });

  it('a night with no shade pick is quiet', () => {
    let s = setup(5);
    // The shades never choose: force their turn past without a pick, which is
    // what the 60s night timer does to a role that goes silent.
    s = { ...s, night: { ...s.night!, ready: ['a'], turn: 'oracle' } };
    s = act(s, 'b', 'd', T0);
    s = act(s, 'c', 'd', T0);
    if (s.phase === 'night') s = resolveNight(s, T0 + 60_000);
    expect(s.phase).toBe('day');
    expect(s.lastNight).toEqual({ number: 1, killedId: null, saved: false });
    expect(Object.values(s.alive).every(Boolean)).toBe(true);
  });
});

function toDay(n = 6): NightfallState {
  let s = setup(n);
  s = act(s, 'a', 'f', T0);
  s = act(s, 'b', 'e', T0);
  s = act(s, 'c', 'e', T0);
  expect(s.phase).toBe('day');
  expect(s.alive.f).toBe(false);
  return s; // living: a(shade) b(oracle) c(healer) d e
}

describe('day votes', () => {
  it('rejects dead voters, dead targets and self-votes; allows changing a vote', () => {
    let s = toDay();
    expect(() => vote(s, 'f', 'a', dayNow(s))).toThrow(/dead/);
    expect(() => vote(s, 'd', 'f', dayNow(s))).toThrow(/not alive/);
    expect(() => vote(s, 'd', 'd', dayNow(s))).toThrow(/yourself/);
    s = vote(s, 'd', 'a', dayNow(s));
    s = vote(s, 'd', 'b', dayNow(s));
    expect(s.day?.votes).toEqual({ d: 'b' });
  });

  it('banishes the plurality and reveals their role, then falls into the next night', () => {
    let s = toDay();
    s = vote(s, 'b', 'a', dayNow(s));
    s = vote(s, 'c', 'a', dayNow(s));
    s = vote(s, 'd', 'a', dayNow(s));
    s = vote(s, 'e', null, dayNow(s));
    expect(s.phase).toBe('day');
    s = vote(s, 'a', 'e', dayNow(s));
    // a is banished -> no shades -> town wins
    expect(s.alive.a).toBe(false);
    expect(s.log.at(-2)).toMatchObject({ kind: 'banish', day: 1, banishedId: 'a', role: 'shade', reason: 'plurality' });
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('town');
  });

  it('a tie banishes nobody and the game continues into night 2', () => {
    let s = toDay();
    s = vote(s, 'a', 'b', dayNow(s));
    s = vote(s, 'b', 'a', dayNow(s));
    s = vote(s, 'c', 'a', dayNow(s));
    s = vote(s, 'd', 'b', dayNow(s));
    s = vote(s, 'e', null, dayNow(s));
    expect(s.log.at(-1)).toMatchObject({ kind: 'banish', banishedId: null, reason: 'tie' });
    expect(s.phase).toBe('night');
    expect(s.dayNumber).toBe(2);
    expect(s.night?.endsAt).toBeGreaterThan(T0 + NIGHT_SECONDS * 1000);
    expect(s.lastNight?.number).toBe(1);
  });

  it('a skip plurality banishes nobody; the host can call the vote early; the day timer expires', () => {
    let s = toDay();
    s = vote(s, 'a', null, dayNow(s));
    s = vote(s, 'b', null, dayNow(s));
    s = vote(s, 'c', 'd', dayNow(s));
    expect(isDayTimeUp(s, T0 + 179_000)).toBe(false);
    expect(isDayTimeUp(s, T0 + 180_000)).toBe(true);
    const called = resolveDay(s, T0 + 20_000);
    expect(called.log.at(-1)).toMatchObject({ kind: 'banish', banishedId: null, reason: 'skip' });
    expect(called.phase).toBe('night');
    expect(Object.values(called.alive).filter(Boolean)).toHaveLength(5);
    expect(() => resolveDay(called, T0)).toThrow(/not day/);
  });

  it('the day view shows open votes and hides hidden roles from the living', () => {
    let s = toDay();
    s = vote(s, 'd', 'a', dayNow(s));
    const v = viewFor(s, 'e', T0);
    expect(v.day?.votes).toEqual({ d: 'a' });
    expect(v.revealedRoles).toEqual({ e: 'townsfolk', f: 'townsfolk' }); // own + the dead
    expect(v.you.hasNightAction).toBe(false);
    const shadeView = viewFor({ ...s, roles: { ...s.roles, d: 'shade' } }, 'a', T0);
    expect(shadeView.revealedRoles.d).toBe('shade');
    expect(shadeView.revealedRoles.b).toBeUndefined();
  });
});

describe('win conditions', () => {
  it('the shades win when they equal the remaining town', () => {
    // 4 players: a shade, b oracle, c d townsfolk. Kill c at night -> 1 shade vs 2 town; banish d -> 1 vs 1 -> shades.
    let s = setup(4);
    s = act(s, 'a', 'c', T0);
    s = act(s, 'b', 'd', T0);
    expect(s.phase).toBe('day');
    expect(winnerOf(s)).toBeNull();
    s = vote(s, 'a', 'd', dayNow(s));
    s = vote(s, 'b', 'd', dayNow(s));
    s = vote(s, 'd', 'a', dayNow(s));
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('shades');
    expect(s.log.at(-1)).toEqual({ kind: 'win', winner: 'shades' });
    // Everyone sees everything once the game ends.
    expect(viewFor(s, 'b', T0).revealedRoles).toEqual(s.roles);
  });

  it('the shades win by a night kill and the town wins by banishing the last shade', () => {
    let s = setup(4);
    s = resolveDay(act(act(s, 'a', 'c'), 'b', 'd'), T0 + 1);
    expect(s.phase).toBe('night');
    s = act(s, 'a', 'd', T0 + 2); // the shade strikes
    s = act(s, 'b', 'a', T0 + 3); // the oracle inspects
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('shades');

    let t = setup(4);
    t = act(act(t, 'a', 'c'), 'b', 'a');
    const at = dayNow(t);
    t = vote(vote(vote(t, 'b', 'a', at), 'd', 'a', at), 'a', 'b', at);
    expect(t.phase).toBe('ended');
    expect(t.winner).toBe('town');
  });

  it('keeps the discussion lock inside the day', () => {
    // The reported bug: a 2-minute lock in a 1-minute day means voting never opens.
    const oneMinuteDay = setSettings(initialState(), { daySeconds: 60 });
    expect(() => setSettings(oneMinuteDay, { voteLockSeconds: 120 })).toThrow(/at most/);

    // Half the day is the ceiling, and it must leave 20s to vote.
    expect(maxVoteLockFor(60)).toBe(30);
    expect(maxVoteLockFor(600)).toBe(300);
    expect(maxVoteLockFor(40)).toBe(20);

    // At the cap it is accepted; one second over it is not.
    const cap = maxVoteLockFor(60);
    expect(setSettings(oneMinuteDay, { voteLockSeconds: cap }).settings.voteLockSeconds).toBe(cap);
    expect(() => setSettings(oneMinuteDay, { voteLockSeconds: cap + 1 })).toThrow(/at most/);

    // A longer day allows a longer lock.
    const tenMinuteDay = setSettings(initialState(), { daySeconds: 600 });
    expect(setSettings(tenMinuteDay, { voteLockSeconds: 120 }).settings.voteLockSeconds).toBe(120);
  });

  it('trims an existing lock when the day is shortened under it', () => {
    // 120s lock is fine in a 10 minute day...
    let s = setSettings(initialState(), { daySeconds: 600, voteLockSeconds: 120 });
    expect(s.settings.voteLockSeconds).toBe(120);

    // ...but shortening the day must not strand it. The host changed the day,
    // not the lock, so the lock is trimmed rather than the change refused.
    s = setSettings(s, { daySeconds: 60 });
    expect(s.settings.daySeconds).toBe(60);
    expect(s.settings.voteLockSeconds).toBe(maxVoteLockFor(60));

    // Voting therefore always opens with time to spare.
    expect(s.settings.voteLockSeconds).toBeLessThan(s.settings.daySeconds);
  });

  it('applies the configured timings to every phase', () => {
    // A short, snappy game: 20s turns, no discussion lock, 1 minute days.
    let s = setSettings(initialState(), { nightSeconds: 20, voteLockSeconds: 0, daySeconds: 60 });
    s = startGame(s, players(6), T0, seeded());
    const roles: Record<string, Role> = { a: 'shade', b: 'oracle', c: 'healer', d: 'townsfolk', e: 'townsfolk', f: 'townsfolk' };
    s = { ...s, roles };

    // Night uses the configured per-role turn, not the 60s default.
    expect(s.night!.endsAt).toBe(T0 + 20_000);
    s = nightReady(nightAction(s, 'a', 'd', T0 + 1), 'a', T0 + 1);
    // ...and the next role gets its own 20s, measured from when it woke.
    expect(s.night!.endsAt).toBe(T0 + 1 + 20_000);

    s = nightReady(nightAction(s, 'b', 'a', T0 + 2), 'b', T0 + 2);
    s = nightReady(nightAction(s, 'c', 'e', T0 + 3), 'c', T0 + 3);
    expect(s.phase).toBe('day');
    // Day uses the configured length, and voting opens immediately at 0s lock.
    expect(s.day!.endsAt).toBe(T0 + 3 + 60_000);
    expect(s.day!.votesOpenAt).toBe(T0 + 3);
    // With no lock, a vote lands straight away.
    expect(() => vote(s, 'b', 'a', T0 + 3)).not.toThrow();
  });

  it('reset returns to the lobby keeping settings', () => {
    const base = setup(4);
    const s = reset({ ...base, settings: { ...base.settings, daySeconds: 240 } });
    expect(s.phase).toBe('lobby');
    expect(s.settings.daySeconds).toBe(240);
    expect(s.participantIds).toEqual([]);
  });
});

describe('leavers', () => {
  it('a removed shade counts as dead and can hand the town the win', () => {
    const s = removePlayer(setup(5), 'a', T0);
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('town');
    expect(s.left).toEqual(['a']);
    expect(s.log.some((e) => e.kind === 'left' && e.playerId === 'a')).toBe(true);
  });

  it('removing the last pending night actor resolves the night', () => {
    let s = setup(6);
    s = act(s, 'a', 'd', T0); // shade done -> oracle's turn
    expect(s.night?.turn).toBe('oracle');
    expect(pendingNightActors(s)).toEqual(['b', 'c']);
    // The oracle leaves while it is their turn; the night must not stall.
    s = removePlayer(s, 'b', T0 + 5);
    expect(s.night?.turn).toBe('healer');
    s = act(s, 'c', 'e', T0 + 6);
    expect(s.phase).toBe('day');
    expect(s.alive.b).toBe(false);
    expect(s.alive.d).toBe(false);
    expect(s.oracleResults.b).toBeUndefined();
    // Left players keep their role hidden from the living.
    expect(viewFor(s, 'e', T0).revealedRoles.b).toBeUndefined();
    expect(viewFor(s, 'e', T0).left).toEqual(['b']);
  });

  it('removing a voter or vote target during the day drops those votes and can resolve the day', () => {
    let s = toDay();
    s = vote(s, 'a', 'e', dayNow(s));
    s = vote(s, 'b', 'e', dayNow(s));
    s = vote(s, 'c', 'e', dayNow(s));
    s = vote(s, 'e', 'a', dayNow(s));
    // d is the last non-voter; removing d lets the day resolve with the votes that remain.
    s = removePlayer(s, 'd', T0 + 9);
    expect(s.alive.d).toBe(false);
    const banish = s.log.find((e) => e.kind === 'banish');
    expect(banish).toMatchObject({ banishedId: 'e', reason: 'plurality', votes: { a: 'e', b: 'e', c: 'e', e: 'a' } });
    // a(shade) b c remain -> 1 shade vs 2 town -> night 2
    expect(s.phase).toBe('night');
    expect(s.dayNumber).toBe(2);
  });

  it('drops votes cast for a removed player, leaving the voter to vote again', () => {
    let s = toDay();
    s = vote(s, 'a', 'd', dayNow(s));
    s = vote(s, 'b', 'e', dayNow(s));
    s = removePlayer(s, 'd', T0 + 1);
    expect(s.phase).toBe('day');
    expect(s.day?.votes).toEqual({ b: 'e' });
  });

  it('ignores non-participants and idle phases', () => {
    const lobby = initialState();
    expect(removePlayer(lobby, 'a', T0)).toBe(lobby);
    const s = setup(5);
    expect(removePlayer(s, 'zz', T0)).toBe(s);
  });
});
