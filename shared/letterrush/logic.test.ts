import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import { CATEGORIES, CATEGORY_NAMES, LETTERS, normalize, startsWithLetter } from './categories.js';
import {
  activeIds,
  cleanAnswer,
  finishReview,
  gradeRound,
  initialState,
  isRejected,
  isTimeUp,
  markDone,
  nextRound,
  removeParticipant,
  reset,
  setSettings,
  startGame,
  submitAnswer,
  timeUp,
  toggleFlag,
  viewFor,
} from './logic.js';
import { CATEGORIES_PER_ROUND, REVIEW_SECONDS, SCORES_SECONDS } from './types.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const players: BasePlayer[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), connected: true }));
const T0 = 1_000_000;

function fresh(seed = 1, who = players) {
  return startGame(initialState(), who, T0, seeded(seed));
}

/** Answers that start with the round letter, unique per player unless overridden. */
function word(letter: string, suffix: string) {
  return `${letter}${suffix}`;
}

describe('content', () => {
  it('has at least 60 original categories with 12-20 examples spread across letters', () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CATEGORY_NAMES).size).toBe(CATEGORY_NAMES.length);
    for (const c of CATEGORIES) {
      expect(c.examples.length, c.name).toBeGreaterThanOrEqual(12);
      expect(c.examples.length, c.name).toBeLessThanOrEqual(24);
      const initials = new Set(c.examples.map((e) => normalize(e).charAt(0)));
      expect(initials.size, c.name).toBeGreaterThanOrEqual(10);
    }
    expect(LETTERS).toHaveLength(23);
    expect(LETTERS).not.toContain('Q');
    expect(LETTERS).not.toContain('X');
    expect(LETTERS).not.toContain('Z');
  });
});

describe('letter validation and normalization', () => {
  it('accepts answers that start with the letter, ignoring case and a leading article', () => {
    expect(startsWithLetter('lion', 'L')).toBe(true);
    expect(startsWithLetter('  Lion  ', 'l')).toBe(true);
    expect(startsWithLetter('The Lion', 'L')).toBe(true);
    expect(startsWithLetter('a lamp', 'L')).toBe(true);
    expect(startsWithLetter('An Lorry', 'L')).toBe(true);
    expect(startsWithLetter('"Lantern"', 'L')).toBe(true);
    expect(startsWithLetter('Tiger', 'L')).toBe(false);
    expect(startsWithLetter('The', 'T')).toBe(true); // "The" alone is a word, not an article
    expect(startsWithLetter('Apple', 'A')).toBe(true); // "A" without a following word is not an article
    expect(startsWithLetter('', 'L')).toBe(false);
    expect(startsWithLetter('   ', 'L')).toBe(false);
  });

  it('normalizes for duplicate detection', () => {
    expect(normalize('  The  Ice-Cream! ')).toBe('icecream');
    expect(normalize('ice cream')).toBe('icecream');
    expect(normalize('A Bagel')).toBe('bagel');
    expect(normalize('an apple')).toBe('apple');
    expect(normalize('Apple')).toBe('apple');
    expect(normalize('')).toBe('');
  });

  it('cleanAnswer blanks invalid answers and trims valid ones', () => {
    expect(cleanAnswer('  the   lemon ', 'L')).toBe('the lemon');
    expect(cleanAnswer('mango', 'L')).toBe('');
    expect(cleanAnswer('L' + 'x'.repeat(100), 'L')).toHaveLength(40);
  });
});

describe('settings', () => {
  it('validates ranges and only changes in the lobby', () => {
    const s = setSettings(initialState(), 5, 90);
    expect(s.settings).toMatchObject({ rounds: 5, roundSeconds: 90, categoriesPerRound: 6 });
    expect(() => setSettings(initialState(), 0, 60)).toThrow(/Rounds/);
    expect(() => setSettings(initialState(), 11, 60)).toThrow(/Rounds/);
    expect(() => setSettings(initialState(), 3, 20)).toThrow(/Round length/);
    expect(() => setSettings(initialState(), 3, 181)).toThrow(/Round length/);
    expect(() => setSettings(fresh(), 3, 60)).toThrow(/lobby/);
  });
});

describe('startGame', () => {
  it('deals a letter, six distinct categories and blank answer sheets', () => {
    const s = fresh();
    expect(s.phase).toBe('writing');
    const r = s.round!;
    expect(LETTERS).toContain(r.letter);
    expect(r.categories).toHaveLength(CATEGORIES_PER_ROUND);
    expect(new Set(r.categories).size).toBe(CATEGORIES_PER_ROUND);
    expect(r.endsAt).toBe(T0 + 60_000);
    expect(Object.keys(r.answers)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.answers.a).toEqual(['', '', '', '', '', '']);
    expect(s.scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(s.usedCategories).toEqual(r.categories);
  });

  it('refuses fewer than 2 players and refuses to start twice', () => {
    expect(() => startGame(initialState(), players.slice(0, 1), T0)).toThrow(/at least 2/);
    expect(() => startGame(fresh(), players, T0)).toThrow(/already started/);
  });
});

describe('submitAnswer', () => {
  it('stores valid answers, blanks invalid ones, and guards phase / seat / done', () => {
    let s = fresh();
    const L = s.round!.letter;
    s = submitAnswer(s, 'a', 0, ` ${L.toLowerCase()}ovely `);
    expect(s.round!.answers.a[0]).toBe(`${L.toLowerCase()}ovely`);
    s = submitAnswer(s, 'a', 1, 'zzz-not-the-letter');
    expect(s.round!.answers.a[1]).toBe('');
    expect(() => submitAnswer(s, 'zed', 0, word(L, 'x'))).toThrow(/not in this round/);
    expect(() => submitAnswer(s, 'a', 9, word(L, 'x'))).toThrow(/Unknown category/);
    s = markDone(s, 'a', T0 + 1000);
    expect(() => submitAnswer(s, 'a', 2, word(L, 'x'))).toThrow(/already pressed Done/);
    const review = timeUp(s, s.round!.endsAt, players);
    expect(() => submitAnswer(review, 'b', 0, word(L, 'x'))).toThrow(/Writing time is over/);
  });
});

describe('grading', () => {
  it('unique answers score 1, duplicates 0 for everyone involved, blanks 0', () => {
    let s = fresh();
    const L = s.round!.letter;
    s = submitAnswer(s, 'a', 0, word(L, 'amp'));
    s = submitAnswer(s, 'b', 0, `The ${L}amp!`); // same after normalization
    s = submitAnswer(s, 'c', 0, word(L, 'ion'));
    // d leaves category 0 blank
    const { cells, points } = gradeRound(s.round!);
    expect(cells[0].a.status).toBe('dupe');
    expect(cells[0].b.status).toBe('dupe');
    expect(cells[0].c.status).toBe('ok');
    expect(cells[0].d.status).toBe('blank');
    expect(points).toEqual({ a: 0, b: 0, c: 1, d: 0 });
  });

  it('a strict majority of the other participants rejects an answer', () => {
    // 4 players: author + 3 others. 1 flag: no. 2 flags: yes (2 > 1.5).
    expect(isRejected(['b'], ['b', 'c', 'd'])).toBe(false);
    expect(isRejected(['b', 'c'], ['b', 'c', 'd'])).toBe(true);
    // 3 players: author + 2 others. 1 flag is not a strict majority; 2 is.
    expect(isRejected(['b'], ['b', 'c'])).toBe(false);
    expect(isRejected(['b', 'c'], ['b', 'c'])).toBe(true);
    // Flags from people who are not "others" (author, leavers) do not count.
    expect(isRejected(['a', 'zed'], ['b', 'c'])).toBe(false);
    expect(isRejected([], [])).toBe(false);
  });

  it('flags toggle during review and rejected answers show up as rejected', () => {
    let s = fresh();
    const L = s.round!.letter;
    for (const id of ['a', 'b', 'c', 'd']) s = submitAnswer(s, id, 0, word(L, id));
    expect(() => toggleFlag(s, 'b', 0, 'a')).toThrow(/during review/);
    s = timeUp(s, s.round!.endsAt, players);
    expect(s.phase).toBe('review');
    expect(() => toggleFlag(s, 'a', 0, 'a')).toThrow(/own answer/);
    expect(() => toggleFlag(s, 'b', 1, 'a')).toThrow(/already blank/);
    s = toggleFlag(s, 'b', 0, 'a');
    expect(gradeRound(s.round!).cells[0].a).toMatchObject({ status: 'ok', flaggedBy: ['b'] });
    s = toggleFlag(s, 'c', 0, 'a');
    expect(gradeRound(s.round!).cells[0].a).toMatchObject({ status: 'rejected', points: 0 });
    s = toggleFlag(s, 'c', 0, 'a'); // un-flag
    expect(gradeRound(s.round!).cells[0].a.status).toBe('ok');
    expect(viewFor(s, 'a', T0).round!.points).toEqual({ a: 1, b: 1, c: 1, d: 1 });
  });
});

describe('phase transitions', () => {
  it('writing ends when everyone is done, review ends when everyone is done reviewing', () => {
    let s = fresh();
    const L = s.round!.letter;
    s = submitAnswer(s, 'a', 0, word(L, 'a'));
    s = markDone(s, 'a', T0 + 1);
    s = markDone(s, 'b', T0 + 2);
    s = markDone(s, 'c', T0 + 3);
    expect(s.phase).toBe('writing');
    s = markDone(s, 'd', T0 + 4);
    expect(s.phase).toBe('review');
    expect(s.round!.endsAt).toBe(T0 + 4 + REVIEW_SECONDS * 1000);
    for (const id of ['a', 'b', 'c']) s = markDone(s, id, T0 + 10);
    expect(s.phase).toBe('review');
    s = markDone(s, 'd', T0 + 10);
    expect(s.phase).toBe('scores');
    expect(s.round!.roundPoints).toEqual({ a: 1, b: 0, c: 0, d: 0 });
    expect(s.scores).toEqual({ a: 1, b: 0, c: 0, d: 0 });
    expect(s.roundsPlayed).toBe(1);
    expect(s.round!.endsAt).toBe(T0 + 10 + SCORES_SECONDS * 1000);
  });

  it('timers advance writing -> review -> scores -> next round, and the host can finish review early', () => {
    let s = fresh();
    const end = s.round!.endsAt;
    expect(isTimeUp(s, end - 1)).toBe(false);
    expect(timeUp(s, end - 1, players).phase).toBe('writing');
    s = timeUp(s, end, players);
    expect(s.phase).toBe('review');
    expect(() => finishReview(fresh(), T0)).toThrow(/no review/);
    const early = finishReview(s, T0);
    expect(early.phase).toBe('scores');
    s = timeUp(s, s.round!.endsAt, players);
    expect(s.phase).toBe('scores');
    expect(() => nextRound(fresh(), players, T0)).toThrow(/not over/);
    s = timeUp(s, s.round!.endsAt, players, seeded(7));
    expect(s.phase).toBe('writing');
    expect(s.round!.number).toBe(2);
  });

  it('never repeats a category within a game and ends after the final round', () => {
    let s = startGame(setSettings(initialState(), 10, 60), players, T0, seeded(3));
    const seen = new Set<string>();
    for (let round = 1; round <= 10; round++) {
      expect(s.phase).toBe('writing');
      expect(s.round!.number).toBe(round);
      for (const c of s.round!.categories) {
        expect(seen.has(c), `${c} repeated in round ${round}`).toBe(false);
        seen.add(c);
      }
      s = finishReview(timeUp(s, s.round!.endsAt, players), T0);
      s = nextRound(s, players, T0, seeded(round));
    }
    expect(s.phase).toBe('ended');
    expect(s.roundsPlayed).toBe(10);
  });

  it('accumulates scores across rounds and resets to the lobby keeping settings', () => {
    let s = startGame(setSettings(initialState(), 2, 45), players, T0, seeded(5));
    const L1 = s.round!.letter;
    s = submitAnswer(s, 'a', 0, word(L1, 'one'));
    s = submitAnswer(s, 'a', 1, word(L1, 'two'));
    s = submitAnswer(s, 'b', 2, word(L1, 'three'));
    s = finishReview(timeUp(s, s.round!.endsAt, players), T0);
    expect(s.scores).toEqual({ a: 2, b: 1, c: 0, d: 0 });
    s = nextRound(s, players, T0, seeded(6));
    const L2 = s.round!.letter;
    s = submitAnswer(s, 'b', 0, word(L2, 'four'));
    s = finishReview(timeUp(s, s.round!.endsAt, players), T0);
    expect(s.scores).toEqual({ a: 2, b: 2, c: 0, d: 0 });
    s = nextRound(s, players, T0);
    expect(s.phase).toBe('ended');
    const back = reset(s);
    expect(back.phase).toBe('lobby');
    expect(back.scores).toEqual({});
    expect(back.settings.roundSeconds).toBe(45);
  });
});

describe('leavers', () => {
  it('a leaver is excluded from readiness and majorities but their answers stay', () => {
    let s = fresh();
    const L = s.round!.letter;
    for (const id of ['a', 'b', 'c', 'd']) s = submitAnswer(s, id, 0, word(L, id));
    s = markDone(s, 'a', T0);
    s = markDone(s, 'b', T0);
    s = markDone(s, 'c', T0);
    s = removeParticipant(s, 'd', T0 + 5); // last holdout leaves -> review starts
    expect(s.phase).toBe('review');
    expect(activeIds(s.round!)).toEqual(['a', 'b', 'c']);
    expect(s.round!.answers.d[0]).toBe(word(L, 'd'));
    expect(gradeRound(s.round!).cells[0].d.status).toBe('ok');
    // Others for author a are now just b and c: one flag is not a majority, two are.
    s = toggleFlag(s, 'b', 0, 'a');
    expect(gradeRound(s.round!).cells[0].a.status).toBe('ok');
    s = toggleFlag(s, 'c', 0, 'a');
    expect(gradeRound(s.round!).cells[0].a.status).toBe('rejected');
    expect(() => markDone(s, 'd', T0)).toThrow(/not in this round/);
    s = markDone(s, 'a', T0);
    s = markDone(s, 'b', T0);
    s = markDone(s, 'c', T0);
    expect(s.phase).toBe('scores');
    expect(s.round!.roundPoints).toEqual({ a: 0, b: 1, c: 1, d: 1 });
    expect(removeParticipant(s, 'nobody', T0)).toBe(s);
  });
});

describe('viewFor', () => {
  it('hides other players answers while writing and reveals the graded grid afterwards', () => {
    let s = fresh();
    const L = s.round!.letter;
    s = submitAnswer(s, 'a', 0, word(L, 'a'));
    s = submitAnswer(s, 'b', 0, word(L, 'b'));
    const v = viewFor(s, 'a', T0);
    expect(Object.keys(v.round!.answers)).toEqual(['a']);
    expect(v.round!.cells).toBeNull();
    expect(v.round!.activeIds).toEqual(['a', 'b', 'c', 'd']);
    expect(v.serverNow).toBe(T0);
    const spectator = viewFor(s, 'zed', T0);
    expect(spectator.round!.answers).toEqual({});
    const r = timeUp(s, s.round!.endsAt, players);
    const rv = viewFor(r, 'a', T0);
    expect(Object.keys(rv.round!.answers)).toEqual(['a', 'b', 'c', 'd']);
    expect(rv.round!.cells![0].b.text).toBe(word(L, 'b'));
    expect(rv.round!.points).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });
});
