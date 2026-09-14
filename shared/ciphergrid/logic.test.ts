import { describe, expect, it } from 'vitest';
import {
  createGame,
  emptyGame,
  isTurnTimeUp,
  setSettings,
  turnTimeout,
  endTurn,
  giveClue,
  guess,
  randomizeTeams,
  remainingCards,
  teamsReady,
  viewFor,
} from './logic.js';
import type { Player } from './types.js';
import { WORDS } from './words.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const T0 = 1_000_000;

const redSpy: Player = { id: 'a', name: 'Ann', team: 'red', role: 'spymaster', connected: true };
const redOp: Player = { id: 'b', name: 'Bob', team: 'red', role: 'operative', connected: true };
const blueSpy: Player = { id: 'c', name: 'Cid', team: 'blue', role: 'spymaster', connected: true };
const blueOp: Player = { id: 'd', name: 'Dee', team: 'blue', role: 'operative', connected: true };

describe('createGame', () => {
  it('deals a 25-card board with 9/8/7/1 split', () => {
    const g = createGame(seeded());
    expect(g.cards).toHaveLength(25);
    const counts = { red: 0, blue: 0, neutral: 0, assassin: 0 };
    for (const c of g.cards) counts[c.type]++;
    expect(counts.neutral).toBe(7);
    expect(counts.assassin).toBe(1);
    expect(counts[g.startingTeam]).toBe(9);
    expect(g.turn).toBe(g.startingTeam);
    expect(new Set(g.cards.map((c) => c.word)).size).toBe(25);
  });
});

describe('turn flow', () => {
  it('clue then correct guesses decrement, wrong guess ends turn', () => {
    let g = createGame(seeded(7));
    const [spy, op, other] = g.turn === 'red' ? [redSpy, redOp, blueOp] : [blueSpy, blueOp, redOp];

    expect(() => guess(g, op, 0)).toThrow(/clue/i);
    expect(() => giveClue(g, other, 'X', 1)).toThrow(/turn/i);
    expect(() => giveClue(g, spy, g.cards[0].word, 1)).toThrow(/board/i);

    g = giveClue(g, spy, 'hint', 2);
    expect(g.currentClue?.word).toBe('HINT');
    expect(g.guessesRemaining).toBe(3);

    const ownIdx = g.cards.findIndex((c) => c.type === g.turn);
    g = guess(g, op, ownIdx);
    expect(g.cards[ownIdx].revealed).toBe(true);
    expect(g.guessesRemaining).toBe(2);
    expect(g.turn).toBe(spy.team);

    const neutralIdx = g.cards.findIndex((c) => c.type === 'neutral');
    g = guess(g, op, neutralIdx);
    expect(g.turn).not.toBe(spy.team);
    expect(g.currentClue).toBeNull();
  });

  it('assassin loses the game immediately', () => {
    let g = createGame(seeded(3));
    const [spy, op] = g.turn === 'red' ? [redSpy, redOp] : [blueSpy, blueOp];
    g = giveClue(g, spy, 'oops', 1);
    const idx = g.cards.findIndex((c) => c.type === 'assassin');
    g = guess(g, op, idx);
    expect(g.phase).toBe('ended');
    expect(g.winner).not.toBe(spy.team);
  });

  it('revealing all team cards wins', () => {
    let g = createGame(seeded(11));
    const team = g.turn;
    const [spy, op] = team === 'red' ? [redSpy, redOp] : [blueSpy, blueOp];
    g = giveClue(g, spy, 'all', 0); // unlimited guesses
    for (let i = 0; i < g.cards.length && g.phase === 'playing'; i++) {
      if (g.cards[i].type === team) g = guess(g, op, i);
    }
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe(team);
    expect(remainingCards(g)[team]).toBe(0);
  });

  it('operatives can end the turn after a clue', () => {
    let g = createGame(seeded(5));
    const [spy, op] = g.turn === 'red' ? [redSpy, redOp] : [blueSpy, blueOp];
    expect(() => endTurn(g, op)).toThrow();
    g = giveClue(g, spy, 'go', 1);
    g = endTurn(g, op);
    expect(g.turn).not.toBe(spy.team);
  });
});

describe('settings and timers', () => {
  it('validates the two timers and allows switching them off', () => {
    const base = emptyGame();
    expect(base.settings).toEqual({ clueSeconds: 0, guessSeconds: 0 });

    expect(setSettings(base, { clueSeconds: 90 }).settings.clueSeconds).toBe(90);
    expect(setSettings(base, { clueSeconds: 0 }).settings.clueSeconds).toBe(0); // off
    expect(() => setSettings(base, { clueSeconds: 5 })).toThrow(/must be 0/);
    expect(() => setSettings(base, { guessSeconds: 9999 })).toThrow(/must be 0/);

    // A patch only touches what it names.
    const both = setSettings(base, { guessSeconds: 60 });
    expect(both.settings.guessSeconds).toBe(60);
    expect(both.settings.clueSeconds).toBe(0);
  });

  it('runs no clock when the timers are off', () => {
    const g = createGame(seeded(4), WORDS, { clueSeconds: 0, guessSeconds: 0 }, T0);
    expect(g.turnEndsAt).toBeNull();
    expect(isTurnTimeUp(g, T0 + 10_000_000)).toBe(false);
  });

  it('gives the spymaster a clue clock and the operatives a guess clock', () => {
    let g = createGame(seeded(7), WORDS, { clueSeconds: 90, guessSeconds: 60 }, T0);
    // The first spymaster is on the clock.
    expect(g.turnEndsAt).toBe(T0 + 90_000);

    const [spy, op] = g.turn === 'red' ? [redSpy, redOp] : [blueSpy, blueOp];
    g = giveClue(g, spy, 'hint', 2, T0 + 5_000);
    // Handing in the clue starts a fresh guessing clock.
    expect(g.turnEndsAt).toBe(T0 + 5_000 + 60_000);

    // Ending the turn puts the next spymaster on their own clue clock.
    g = endTurn(g, op, T0 + 20_000);
    expect(g.turnEndsAt).toBe(T0 + 20_000 + 90_000);
  });

  it('passes the turn when the clock runs out, without ending the game', () => {
    const g = createGame(seeded(11), WORDS, { clueSeconds: 30, guessSeconds: 30 }, T0);
    const team = g.turn;
    expect(isTurnTimeUp(g, T0 + 29_000)).toBe(false);
    expect(isTurnTimeUp(g, T0 + 30_000)).toBe(true);

    const after = turnTimeout(g, T0 + 30_000);
    expect(after.phase).toBe('playing');
    expect(after.turn).not.toBe(team);
    expect(after.currentClue).toBeNull();
    expect(after.log.at(-1)).toMatchObject({ kind: 'timeout', team, phase: 'clue' });
    // And the next team gets a full clock of their own.
    expect(after.turnEndsAt).toBe(T0 + 30_000 + 30_000);
  });

  it('a finished game stops the clock', () => {
    let g = createGame(seeded(3), WORDS, { clueSeconds: 60, guessSeconds: 60 }, T0);
    const [spy, op] = g.turn === 'red' ? [redSpy, redOp] : [blueSpy, blueOp];
    g = giveClue(g, spy, 'oops', 1, T0);
    const assassin = g.cards.findIndex((c) => c.type === 'assassin');
    g = guess(g, op, assassin, T0 + 1_000);
    expect(g.phase).toBe('ended');
    expect(g.turnEndsAt).toBeNull();
    expect(isTurnTimeUp(g, T0 + 999_999)).toBe(false);
  });
});

describe('viewFor', () => {
  it('hides unrevealed types from operatives and shows them to spymasters', () => {
    const g = createGame(seeded(9));
    const opView = viewFor(g, redOp);
    expect(opView.cards.every((c) => c.type === undefined)).toBe(true);
    const spyView = viewFor(g, redSpy);
    expect(spyView.cards.every((c) => c.type !== undefined)).toBe(true);
  });
});

describe('teams', () => {
  it('requires a spymaster and operative on both teams', () => {
    expect(teamsReady([redSpy, redOp, blueSpy, blueOp])).toBeNull();
    expect(teamsReady([redSpy, redOp, blueOp])).toMatch(/Blue.*spymaster/);
    expect(teamsReady([redSpy, blueSpy, blueOp])).toMatch(/Red.*operative/);
  });

  it('randomizes into two teams with one spymaster each', () => {
    const players = [redSpy, redOp, blueSpy, blueOp, { ...redOp, id: 'e' }].map((p) => ({
      ...p,
      team: null,
      role: null,
    }));
    const out = randomizeTeams(players, seeded(1));
    expect(teamsReady(out)).toBeNull();
    expect(out.filter((p) => p.role === 'spymaster')).toHaveLength(2);
  });
});
