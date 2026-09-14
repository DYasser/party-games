import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import {
  activeIds,
  botAction,
  challenge,
  countMatching,
  initialState,
  isLegalRaise,
  isRevealOver,
  isTurnExpired,
  minimumRaise,
  nextActiveAfter,
  nextRound,
  placeBid,
  raiseProblem,
  removePlayer,
  reset,
  setSettings,
  standings,
  startGame,
  turnTimeout,
  viewFor,
} from './logic.js';
import { REVEAL_MS, TURN_SECONDS, type BluffDiceState } from './types.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const players: BasePlayer[] = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), connected: true }));
const T0 = 1_000_000;
const wild = { dicePerPlayer: 5, onesWild: true };
const plain = { dicePerPlayer: 5, onesWild: false };

/** A 3-player game with fixed dice so outcomes are predictable. */
function rigged(dice: Record<string, number[]>, starter = 'a', onesWild = true): BluffDiceState {
  let s = setSettings(initialState(), { dicePerPlayer: 3, onesWild });
  s = startGame(s, players, T0, seeded(1));
  const ps = { ...s.players };
  for (const [id, d] of Object.entries(dice)) ps[id] = { ...ps[id], dice: d, diceCount: d.length };
  return { ...s, players: ps, currentPlayerId: starter };
}

describe('setup', () => {
  it('deals dicePerPlayer dice to everyone and picks a starter', () => {
    const s = startGame(setSettings(initialState(), { dicePerPlayer: 4 }), players, T0, seeded(3));
    expect(s.phase).toBe('bidding');
    expect(s.seatOrder).toEqual(['a', 'b', 'c']);
    for (const p of Object.values(s.players)) {
      expect(p.diceCount).toBe(4);
      expect(p.dice).toHaveLength(4);
      expect(p.dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    }
    expect(s.seatOrder).toContain(s.currentPlayerId);
    expect(s.turnEndsAt).toBe(T0 + TURN_SECONDS * 1000);
  });

  it('rejects bad settings and too few players', () => {
    expect(() => setSettings(initialState(), { dicePerPlayer: 2 })).toThrow(/between 3 and 6/);
    expect(() => setSettings(initialState(), { dicePerPlayer: 7 })).toThrow();
    expect(() => startGame(initialState(), players.slice(0, 1), T0)).toThrow(/at least 2/);
    expect(() => setSettings(startGame(initialState(), players, T0), { onesWild: false })).toThrow(/between games/);
  });
});

describe('raise legality', () => {
  it('requires higher quantity, or equal quantity and higher face', () => {
    const cur = { quantity: 3, face: 4, bidderId: 'a' };
    expect(isLegalRaise(cur, 4, 2, wild, 15)).toBe(true);
    expect(isLegalRaise(cur, 3, 5, wild, 15)).toBe(true);
    expect(isLegalRaise(cur, 3, 4, wild, 15)).toBe(false);
    expect(isLegalRaise(cur, 3, 3, wild, 15)).toBe(false);
    expect(isLegalRaise(cur, 2, 6, wild, 15)).toBe(false);
    expect(raiseProblem(cur, 3, 3, wild, 15)).toMatch(/must raise/);
  });

  it('caps quantity at the dice in play and restricts faces by the wild rule', () => {
    expect(isLegalRaise(null, 16, 3, wild, 15)).toBe(false);
    expect(isLegalRaise(null, 15, 3, wild, 15)).toBe(true);
    expect(isLegalRaise(null, 1, 1, wild, 15)).toBe(false);
    expect(isLegalRaise(null, 1, 1, plain, 15)).toBe(true);
    expect(isLegalRaise(null, 0, 2, wild, 15)).toBe(false);
    expect(isLegalRaise(null, 1, 7, plain, 15)).toBe(false);
  });

  it('computes the minimum raise, including the capped case', () => {
    expect(minimumRaise(null, wild, 9)).toEqual({ quantity: 1, face: 2 });
    expect(minimumRaise(null, plain, 9)).toEqual({ quantity: 1, face: 1 });
    expect(minimumRaise({ quantity: 2, face: 3, bidderId: 'a' }, wild, 9)).toEqual({ quantity: 2, face: 4 });
    expect(minimumRaise({ quantity: 2, face: 6, bidderId: 'a' }, wild, 9)).toEqual({ quantity: 3, face: 2 });
    expect(minimumRaise({ quantity: 9, face: 6, bidderId: 'a' }, wild, 9)).toBeNull();
  });
});

describe('wild counting', () => {
  it('counts ones as the bid face when wild, and not otherwise', () => {
    expect(countMatching([1, 1, 5, 5, 2], 5, true)).toBe(4);
    expect(countMatching([1, 1, 5, 5, 2], 5, false)).toBe(2);
    expect(countMatching([1, 1, 5], 1, false)).toBe(2);
    expect(countMatching([1, 1, 5], 1, true)).toBe(2);
  });
});

describe('bidding and challenging', () => {
  it('enforces turn order and skips players with no dice', () => {
    let s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    expect(() => placeBid(s, 'b', 1, 2, T0)).toThrow(/not your turn/);
    s = placeBid(s, 'a', 1, 2, T0 + 10);
    expect(s.bid).toEqual({ quantity: 1, face: 2, bidderId: 'a' });
    expect(s.currentPlayerId).toBe('b');
    expect(s.turnEndsAt).toBe(T0 + 10 + TURN_SECONDS * 1000);
    expect(() => placeBid(s, 'b', 1, 2, T0)).toThrow(/must raise/);

    // With b out of dice, the turn passes from a straight to c.
    const noB = { ...s, players: { ...s.players, b: { ...s.players.b, diceCount: 0, dice: [] } }, currentPlayerId: 'a' };
    expect(activeIds(noB)).toEqual(['a', 'c']);
    expect(nextActiveAfter(noB, 'a')).toBe('c');
    expect(nextActiveAfter(noB, 'c')).toBe('a');
    expect(placeBid(noB, 'a', 2, 2, T0).currentPlayerId).toBe('c');
  });

  it('refuses a challenge with no bid and from a player who is not up', () => {
    const s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    expect(() => challenge(s, 'a', T0)).toThrow(/no bid/);
    const bid = placeBid(s, 'a', 1, 2, T0);
    expect(() => challenge(bid, 'c', T0)).toThrow(/not your turn/);
  });

  it('a standing bid costs the challenger a die (wild ones count)', () => {
    let s = rigged({ a: [1, 5, 2], b: [5, 3, 3], c: [4, 4, 1] }, 'a', true);
    s = placeBid(s, 'a', 4, 5, T0); // actual fives incl. wilds: 1,5 + 5 + 1 = 4
    s = challenge(s, 'b', T0 + 5);
    expect(s.phase).toBe('reveal');
    expect(s.lastResult).toMatchObject({ actual: 4, bidStood: true, loserId: 'b', eliminatedId: null, challengerId: 'b' });
    expect(s.players.b.diceCount).toBe(2);
    expect(s.players.a.diceCount).toBe(3);
    expect(s.revealEndsAt).toBe(T0 + 5 + REVEAL_MS);
  });

  it('the same bid fails without wilds and the bidder loses a die', () => {
    let s = rigged({ a: [1, 5, 2], b: [5, 3, 3], c: [4, 4, 1] }, 'a', false);
    s = placeBid(s, 'a', 4, 5, T0);
    s = challenge(s, 'b', T0);
    expect(s.lastResult).toMatchObject({ actual: 2, bidStood: false, loserId: 'a' });
    expect(s.players.a.diceCount).toBe(2);
    expect(s.players.b.diceCount).toBe(3);
  });
});

describe('rounds, elimination and winning', () => {
  it('the loser opens the next round with rerolled dice', () => {
    let s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    s = placeBid(s, 'a', 9, 6, T0);
    s = challenge(s, 'b', T0); // a was bluffing
    expect(s.lastResult!.loserId).toBe('a');
    expect(isRevealOver(s, T0 + REVEAL_MS - 1)).toBe(false);
    expect(isRevealOver(s, T0 + REVEAL_MS)).toBe(true);
    s = nextRound(s, T0 + REVEAL_MS, seeded(7));
    expect(s.phase).toBe('bidding');
    expect(s.round).toBe(2);
    expect(s.currentPlayerId).toBe('a');
    expect(s.bid).toBeNull();
    expect(s.players.a.dice).toHaveLength(2);
    expect(s.players.b.dice).toHaveLength(3);
  });

  it('an eliminated loser hands the opening to the next seat, and one survivor wins', () => {
    let s = rigged({ a: [2], b: [3, 3], c: [4] }, 'c');
    s = placeBid(s, 'c', 4, 6, T0);
    s = challenge(s, 'a', T0); // c bluffed, loses last die
    expect(s.lastResult).toMatchObject({ loserId: 'c', eliminatedId: 'c' });
    expect(s.eliminationOrder).toEqual(['c']);
    s = nextRound(s, T0, seeded(2));
    expect(s.phase).toBe('bidding');
    expect(s.currentPlayerId).toBe('a'); // next clockwise from c wraps to a
    expect(activeIds(s)).toEqual(['a', 'b']);

    s = { ...s, players: { ...s.players, a: { ...s.players.a, dice: [2] }, b: { ...s.players.b, dice: [3, 3] } } };
    s = placeBid(s, 'a', 3, 2, T0);
    s = challenge(s, 'b', T0);
    expect(s.lastResult).toMatchObject({ loserId: 'a', eliminatedId: 'a' });
    s = nextRound(s, T0);
    expect(s.phase).toBe('ended');
    expect(s.winnerId).toBe('b');
    expect(standings(s)).toEqual(['b', 'a', 'c']);
  });
});

describe('turn timer', () => {
  it('auto-opens with the minimum bid when nobody has bid', () => {
    const s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    expect(isTurnExpired(s, s.turnEndsAt! - 1)).toBe(false);
    expect(turnTimeout(s, s.turnEndsAt! - 1)).toBe(s);
    const t = turnTimeout(s, s.turnEndsAt!);
    expect(t.bid).toEqual({ quantity: 1, face: 2, bidderId: 'a' });
    expect(t.currentPlayerId).toBe('b');
  });

  it('auto-raises the quantity on the same face, or challenges when capped', () => {
    let s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    s = placeBid(s, 'a', 3, 4, T0);
    const t = turnTimeout(s, s.turnEndsAt!);
    expect(t.bid).toEqual({ quantity: 4, face: 4, bidderId: 'b' });

    s = placeBid(rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a'), 'a', 9, 3, T0);
    const c = turnTimeout(s, s.turnEndsAt!);
    expect(c.phase).toBe('reveal');
    expect(c.lastResult!.challengerId).toBe('b');
  });
});

describe('removal', () => {
  it('forfeits dice, advances the turn, and lets a challenge against a departed bidder resolve', () => {
    let s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    s = placeBid(s, 'a', 2, 3, T0);
    // b's turn; b leaves.
    s = removePlayer(s, 'b', T0 + 100);
    expect(s.players.b).toMatchObject({ left: true, diceCount: 0 });
    expect(s.currentPlayerId).toBe('c');
    expect(s.eliminationOrder).toEqual(['b']);
    expect(s.turnEndsAt).toBe(T0 + 100 + TURN_SECONDS * 1000);
    // Bid was 2 threes; with b gone only a's wilds... a has no 1s; actual = 0 -> bid fails.
    s = placeBid(s, 'c', 3, 3, T0);
    // now a's turn: a leaves; bidder c remains; a's departure ends the game since c is alone
    const ended = removePlayer(s, 'a', T0);
    expect(ended.phase).toBe('ended');
    expect(ended.winnerId).toBe('c');

    // Alternative: bidder c leaves instead, leaving a alone -> a wins by default.
    const cLeft = removePlayer(s, 'c', T0);
    expect(cLeft.phase).toBe('ended');
    expect(cLeft.winnerId).toBe('a');
    expect(activeIds(cLeft)).toEqual(['a']);
  });

  it('challenging a bid whose bidder left costs nobody a die when it fails', () => {
    const four = [...players, { id: 'd', name: 'D', connected: true }];
    let s = setSettings(initialState(), { dicePerPlayer: 3, onesWild: false });
    s = startGame(s, four, T0, seeded(5));
    const ps = { ...s.players };
    for (const id of ['a', 'b', 'c', 'd']) ps[id] = { ...ps[id], dice: [2, 2, 2] };
    s = { ...s, players: ps, currentPlayerId: 'a' };
    s = placeBid(s, 'a', 5, 6, T0); // nobody has sixes
    s = removePlayer(s, 'a', T0);
    expect(s.currentPlayerId).toBe('b');
    s = challenge(s, 'b', T0);
    expect(s.lastResult).toMatchObject({ bidStood: false, loserId: null, eliminatedId: null });
    expect(s.players.b.diceCount).toBe(3);
    // Next round: the seat after the departed bidder opens.
    s = nextRound(s, T0, seeded(1));
    expect(s.currentPlayerId).toBe('b');
  });

  it('is a no-op in the lobby or after the game, and reset keeps settings', () => {
    const lobby = setSettings(initialState(), { dicePerPlayer: 4, onesWild: false });
    expect(removePlayer(lobby, 'a', T0)).toBe(lobby);
    const back = reset(startGame(lobby, players, T0));
    expect(back.phase).toBe('lobby');
    expect(back.settings).toEqual({ dicePerPlayer: 4, onesWild: false });
  });
});

describe('views', () => {
  it('hides other players dice while bidding and shows all in reveal or to spectators', () => {
    let s = rigged({ a: [2, 2, 2], b: [3, 3, 3], c: [4, 4, 4] }, 'a');
    const va = viewFor(s, 'a', T0);
    expect(va.players.a.dice).toEqual([2, 2, 2]);
    expect(va.players.b.dice).toBeNull();
    expect(va.totalDice).toBe(9);

    s = placeBid(s, 'a', 1, 2, T0);
    s = challenge(s, 'b', T0);
    expect(viewFor(s, 'b', T0).players.a.dice).toEqual([2, 2, 2]);

    const out = { ...s, phase: 'bidding' as const, players: { ...s.players, c: { ...s.players.c, diceCount: 0, dice: [] } } };
    expect(viewFor(out, 'c', T0).players.a.dice).toEqual([2, 2, 2]);
    expect(viewFor(out, 'a', T0).players.b.dice).toBeNull();
  });
});

describe('bots', () => {
  it('challenges absurd bids and otherwise raises legally', () => {
    let s = rigged({ a: [5, 5, 1], b: [3, 3, 3], c: [4, 4, 4] }, 'b');
    s = placeBid(s, 'b', 9, 6, T0);
    expect(botAction(s, 'c', seeded(1))).toEqual({ type: 'challenge' });

    let t = rigged({ a: [5, 5, 1], b: [3, 3, 3], c: [4, 4, 4] }, 'b');
    t = placeBid(t, 'b', 1, 2, T0);
    for (let seed = 1; seed <= 20; seed++) {
      const act = botAction(t, 'c', seeded(seed));
      expect(act.type).toBe('bid');
      if (act.type === 'bid') expect(isLegalRaise(t.bid, act.quantity, act.face, t.settings, 9)).toBe(true);
    }

    const open = botAction(rigged({ a: [5, 5, 1], b: [3, 3, 3], c: [4, 4, 4] }, 'a'), 'a', seeded(1));
    expect(open).toEqual({ type: 'bid', quantity: 3, face: 5 });
  });
});
