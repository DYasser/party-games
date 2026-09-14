import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import {
  PairRushError,
  buildDeck,
  ensureBoard,
  flip,
  initialState,
  isTimeUp,
  removePlayer,
  setSettings,
  settleAll,
  startGame,
  timeUp,
  viewFor,
} from './logic.js';
import { PEEK_MS, defaultSettings } from './types.js';

const players: BasePlayer[] = [
  { id: 'a', name: 'Ann', connected: true },
  { id: 'b', name: 'Bob', connected: true },
];

/** Deterministic rng so a deal can be reasoned about in a test. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function started(size = 4 as const, now = 1000) {
  const base = setSettings(initialState(), { size });
  return startGame(base, players, now, seeded(7));
}

/** The two indices holding the same symbol as `index`. */
function partnerOf(deck: string[], index: number): number {
  const found = deck.findIndex((s, i) => i !== index && s === deck[index]);
  if (found < 0) throw new Error('deck has no partner, deal is broken');
  return found;
}

function anyMismatch(deck: string[]): [number, number] {
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (deck[i] !== deck[j]) return [i, j];
    }
  }
  throw new Error('deck has no mismatching pair');
}

describe('settings', () => {
  it('accepts the offered sizes and clamps the time limit', () => {
    const s = setSettings(initialState(), { size: 8, roundSeconds: 99999 });
    expect(s.settings.size).toBe(8);
    expect(s.settings.roundSeconds).toBe(900);
    expect(setSettings(initialState(), { roundSeconds: 1 }).settings.roundSeconds).toBe(60);
  });

  it('rejects a size that is not on offer', () => {
    expect(() => setSettings(initialState(), { size: 5 })).toThrow(PairRushError);
    expect(() => setSettings(initialState(), { size: 'big' })).toThrow(PairRushError);
  });

  it('locks once the race is running', () => {
    expect(() => setSettings(started(), { size: 8 })).toThrow(/locked/i);
  });
});

describe('the deal', () => {
  it('gives every symbol exactly twice', () => {
    for (const size of [4, 6, 8, 10] as const) {
      const deck = buildDeck(size, seeded(size));
      expect(deck).toHaveLength(size * size);
      const counts = new Map<string, number>();
      for (const s of deck) counts.set(s, (counts.get(s) ?? 0) + 1);
      expect([...counts.values()].every((n) => n === 2)).toBe(true);
      expect(counts.size).toBe((size * size) / 2);
    }
  });

  it('is identical for every player, which is what makes it a fair race', () => {
    const state = started();
    const viewA = viewFor(state, players[0], players, 1000);
    const viewB = viewFor(state, players[1], players, 1000);
    expect(viewA.cards).toHaveLength(viewB.cards.length);
    // Both see the same number of cards and nothing revealed yet.
    expect(viewA.cards.every((c) => c.symbol === null)).toBe(true);
    expect(viewB.cards.every((c) => c.symbol === null)).toBe(true);
  });
});

describe('flipping', () => {
  it('shows one card, then keeps a matching pair face-up', () => {
    let state = started();
    const partner = partnerOf(state.deck, 0);

    state = flip(state, 'a', 0, 1000);
    expect(state.boards.a.flipped).toEqual([0]);
    expect(state.boards.a.attempts).toBe(0);

    state = flip(state, 'a', partner, 1100);
    expect(state.boards.a.matched.sort()).toEqual([0, partner].sort());
    expect(state.boards.a.flipped).toEqual([]);
    expect(state.boards.a.attempts).toBe(1);
  });

  it('leaves a mismatch showing, then turns it back', () => {
    let state = started();
    const [i, j] = anyMismatch(state.deck);

    state = flip(state, 'a', i, 1000);
    state = flip(state, 'a', j, 1000);
    expect(state.boards.a.flipped).toEqual([i, j]);
    expect(state.boards.a.peekUntil).toBe(1000 + PEEK_MS);

    // Locked while the pair is still showing.
    expect(() => flip(state, 'a', 0, 1000)).toThrow(/turn back/i);

    state = settleAll(state, 1000 + PEEK_MS);
    expect(state.boards.a.flipped).toEqual([]);
    expect(state.boards.a.peekUntil).toBeNull();
    expect(state.boards.a.matched).toEqual([]);
  });

  it('refuses cards that are already matched, face-up, or off the board', () => {
    let state = started();
    const partner = partnerOf(state.deck, 0);
    state = flip(state, 'a', 0, 1000);

    expect(() => flip(state, 'a', 0, 1000)).toThrow(/already face-up/i);
    expect(() => flip(state, 'a', -1, 1000)).toThrow(/not on the board/i);
    expect(() => flip(state, 'a', 999, 1000)).toThrow(/not on the board/i);

    state = flip(state, 'a', partner, 1000);
    expect(() => flip(state, 'a', 0, 1000)).toThrow(/already found/i);
  });

  it('refuses players who are not racing', () => {
    const state = started();
    expect(() => flip(state, 'ghost', 0, 1000)).toThrow(/not in this race/i);
  });

  it('refuses flips before the race starts', () => {
    expect(() => flip(initialState(), 'a', 0, 1000)).toThrow(/not running/i);
  });
});

/** Clear one player's whole board, pair by pair. */
function clearBoard(state: ReturnType<typeof started>, id: string, from = 2000) {
  let s = state;
  let t = from;
  const done = new Set<number>();
  for (let i = 0; i < s.deck.length; i++) {
    if (done.has(i)) continue;
    const partner = partnerOf(s.deck, i);
    done.add(i);
    done.add(partner);
    s = flip(s, id, i, t);
    s = flip(s, id, partner, t);
    t += 10;
  }
  return s;
}

describe('finishing', () => {
  it('records finish order and ends when everyone is done', () => {
    let state = started();

    state = clearBoard(state, 'a');
    expect(state.boards.a.finishOrder).toBe(1);
    expect(state.finished).toEqual(['a']);
    // Bob is still solving, so the race continues.
    expect(state.phase).toBe('playing');

    state = clearBoard(state, 'b', 5000);
    expect(state.boards.b.finishOrder).toBe(2);
    expect(state.phase).toBe('ended');
  });

  it('records how long each finisher took, measured from the start', () => {
    // started() begins the race at t=1000; clearBoard flips from t=2000.
    const state = clearBoard(started(), 'a');
    const view = viewFor(state, players[0], players, 9000);
    expect(view.finishMs).not.toBeNull();
    expect(view.finishMs).toBe(state.boards.a.finishedAt! - state.startedAt!);
    // Bob never finished, so he has no time at all rather than a zero.
    const bobView = viewFor(state, players[1], players, 9000);
    expect(bobView.finishMs).toBeNull();
    expect(bobView.rivals.find((r) => r.id === 'a')?.finishMs).toBe(view.finishMs);
  });

  it('will not let a finished player keep flipping', () => {
    const state = clearBoard(started(), 'a');
    expect(() => flip(state, 'a', 0, 9000)).toThrow(/already finished/i);
  });

  it('ends on the clock, leaving unfinished players unplaced', () => {
    const state = started();
    expect(isTimeUp(state, state.endsAt! - 1)).toBe(false);
    expect(isTimeUp(state, state.endsAt!)).toBe(true);
    const ended = timeUp(state, state.endsAt!);
    expect(ended.phase).toBe('ended');
    expect(ended.boards.a.finishOrder).toBeNull();
  });
});

describe('leavers', () => {
  it('does not deadlock when the last unfinished player leaves', () => {
    let state = started();
    state = clearBoard(state, 'a');
    expect(state.phase).toBe('playing');

    state = removePlayer(state, 'b', 6000);
    // Only finished players remain, so the race is over rather than stuck.
    expect(state.phase).toBe('ended');
    expect(state.boards.b).toBeUndefined();
  });

  it('ends the race when everybody leaves', () => {
    let state = started();
    state = removePlayer(state, 'a', 6000);
    state = removePlayer(state, 'b', 6000);
    expect(state.phase).toBe('ended');
  });

  it('gives a late joiner a fresh board', () => {
    const state = ensureBoard(started(), 'c');
    expect(state.boards.c.matched).toEqual([]);
  });
});

describe('what each player can see', () => {
  it('never sends a symbol the player has not earned', () => {
    let state = started();
    const partner = partnerOf(state.deck, 0);
    const [i, j] = anyMismatch(state.deck);

    state = flip(state, 'a', 0, 1000);
    state = flip(state, 'a', partner, 1000);

    const view = viewFor(state, players[0], players, 1000);
    const revealed = view.cards.filter((c) => c.symbol !== null);
    expect(revealed).toHaveLength(2);
    expect(view.cards[0].matched).toBe(true);

    // Bob has done nothing, so Bob sees nothing, even on Ann's matched cards.
    const bobView = viewFor(state, players[1], players, 1000);
    expect(bobView.cards.every((c) => c.symbol === null)).toBe(true);

    // A mismatch is visible to the player who flipped it, and nobody else.
    // Pick a mismatch Ann has not already matched, or she would rightly see it.
    const annHas = new Set([0, partner]);
    let mi = i;
    let mj = j;
    if (annHas.has(mi) || annHas.has(mj)) {
      const free = state.deck
        .map((_, idx) => idx)
        .filter((idx) => !annHas.has(idx));
      mi = free.find((x) => free.some((y) => y !== x && state.deck[y] !== state.deck[x]))!;
      mj = free.find((y) => y !== mi && state.deck[y] !== state.deck[mi])!;
    }
    let s2 = flip(state, 'b', mi, 1000);
    s2 = flip(s2, 'b', mj, 1000);
    const bobPeek = viewFor(s2, players[1], players, 1000);
    expect(bobPeek.cards.filter((c) => c.symbol !== null)).toHaveLength(2);
    const annOnBobsPeek = viewFor(s2, players[0], players, 1000);
    expect(annOnBobsPeek.cards[mi].symbol).toBeNull();
    expect(annOnBobsPeek.cards[mj].symbol).toBeNull();
  });

  it('shows rivals progress but never their positions', () => {
    let state = started();
    const partner = partnerOf(state.deck, 0);
    state = flip(state, 'a', 0, 1000);
    state = flip(state, 'a', partner, 1000);

    const bobView = viewFor(state, players[1], players, 1000);
    expect(bobView.rivals).toHaveLength(1);
    expect(bobView.rivals[0]).toMatchObject({ id: 'a', pairsFound: 1, attempts: 1 });
    // The rival view carries counts only — no card indices at all.
    expect(JSON.stringify(bobView.rivals)).not.toContain('matched');
  });

  it('reveals the whole board once the race is over', () => {
    const state = timeUp(started(), 9_000_000);
    const view = viewFor(state, players[0], players, 9_000_000);
    expect(view.cards.every((c) => c.symbol !== null)).toBe(true);
  });
});
