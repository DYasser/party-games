import { beforeEach, describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import {
  advance,
  dealRound,
  filterCandidates,
  initialState,
  isRevealOver,
  isTimeUp,
  pointsFor,
  removeParticipant,
  reset,
  scoreGuess,
  setSettings,
  startGame,
  submitGuess,
  timeUp,
  viewFor,
} from './logic.js';
import { REVEAL_MS } from './types.js';
import { ANSWERS, BOT_OPENERS } from './words.js';
import {
  clearDictionaries,
  isAcceptedGuess,
  parseCustomList,
  parseWordList,
  registerDictionary,
  MAX_CUSTOM_WORDS,
} from './dictionary.js';
import { foldWord, isLanguageCode, LANGUAGE_CODES } from './languages.js';

const players: BasePlayer[] = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), connected: true }));
const T0 = 1_000_000;
const POOL = ['CRANE', 'SLATE', 'TRAIL', 'POINT', 'LEVEL'];
const constRng = () => 0; // always picks the first unused word from the pool

/**
 * A small stand-in dictionary. Guesses include a few words that are never
 * answers, so "real word but not an answer" is exercised.
 */
const TEST_GUESSES = [...POOL, 'ADIEU', 'AUDIO', 'RAISE', 'STERN', 'MOUNT', 'BLAME'];

beforeEach(() => {
  clearDictionaries();
  registerDictionary({ language: 'en', guesses: new Set(TEST_GUESSES), answers: POOL });
  registerDictionary({ language: 'fr', guesses: new Set(['ARBRE', 'TABLE', 'CHIEN']), answers: ['ARBRE', 'TABLE'] });
});

function fresh(pool = POOL) {
  return startGame(initialState(), players, T0, constRng, pool);
}

describe('scoreGuess', () => {
  it('marks exact, present and absent letters', () => {
    expect(scoreGuess('CRANE', 'CRANE')).toEqual(['g', 'g', 'g', 'g', 'g']);
    expect(scoreGuess('NACRE', 'CRANE')).toEqual(['y', 'y', 'y', 'y', 'g']);
    expect(scoreGuess('MOSSY', 'CRANE')).toEqual(['x', 'x', 'x', 'x', 'x']);
  });

  it('handles duplicate letters in the guess against a single letter in the answer', () => {
    // Answer has one L; guess has two. Only one may be marked, exact first.
    expect(scoreGuess('LLAMA', 'SLATE')).toEqual(['x', 'g', 'g', 'x', 'x']);
    expect(scoreGuess('ALLOW', 'SLATE')).toEqual(['y', 'g', 'x', 'x', 'x']);
  });

  it('handles duplicate letters in the answer', () => {
    // Answer LEVEL: L,E,V,E,L. Guess EERIE: E at 0 -> y (E exists), E at 1 -> g, R x, I x, E at 4 -> x (both Es used).
    expect(scoreGuess('EERIE', 'LEVEL')).toEqual(['y', 'g', 'x', 'x', 'x']);
    expect(scoreGuess('LULLS', 'LEVEL')).toEqual(['g', 'x', 'y', 'x', 'x']);
  });
});

describe('guess validation', () => {
  it('accepts only real words from the language dictionary', () => {
    expect(isAcceptedGuess('CRANE', 'en')).toBe(true);
    expect(isAcceptedGuess('crane', 'en')).toBe(true); // folded before lookup
    expect(isAcceptedGuess('STERN', 'en')).toBe(true); // a legal guess that is never an answer
    expect(isAcceptedGuess('ZZZZZ', 'en')).toBe(false);
    expect(isAcceptedGuess('CRAN', 'en')).toBe(false);
    expect(isAcceptedGuess('CRANES', 'en')).toBe(false);
    expect(isAcceptedGuess('CR4NE', 'en')).toBe(false);
  });

  it('is scoped per language', () => {
    expect(isAcceptedGuess('ARBRE', 'fr')).toBe(true);
    expect(isAcceptedGuess('ARBRE', 'en')).toBe(false);
    expect(isAcceptedGuess('CRANE', 'fr')).toBe(false);
  });

  it('accepts custom words the dictionary has never heard of', () => {
    expect(isAcceptedGuess('ZZZZZ', 'en')).toBe(false);
    expect(isAcceptedGuess('ZZZZZ', 'en', ['ZZZZZ'])).toBe(true);
  });

  it('rejects non-words, malformed and repeated guesses in a round', () => {
    const s = fresh();
    expect(() => submitGuess(s, 'a', 'abc', T0 + 1)).toThrow(/five letters/);
    expect(() => submitGuess(s, 'a', 'ZZZZZ', T0 + 1)).toThrow(/not in the English word list/);
    expect(() => submitGuess(s, 'zz', 'SLATE', T0 + 1)).toThrow(/not in this round/);
    const s2 = submitGuess(s, 'a', 'slate', T0 + 1);
    expect(() => submitGuess(s2, 'a', 'SLATE', T0 + 2)).toThrow(/already tried/);
  });

  it('folds accented and padded input', () => {
    expect(foldWord('  Etait ')).toBe('ETAIT');
    expect(foldWord('crane')).toBe('CRANE');
  });
});

describe('word list', () => {
  it('has at least 400 unique uppercase five-letter answers', () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(400);
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
    expect(ANSWERS.every((w) => /^[A-Z]{5}$/.test(w))).toBe(true);
  });

  it('ships bot openers that are real five-letter words', () => {
    expect(BOT_OPENERS.every((w) => /^[A-Z]{5}$/.test(w))).toBe(true);
  });

  it('parses a dictionary file, skipping blanks and wrong lengths', () => {
    expect(parseWordList('crane\nSLATE\n\nfour\ntoolong\n')).toEqual(['CRANE', 'SLATE']);
  });
});

describe('languages', () => {
  it('recognises only known codes', () => {
    expect(LANGUAGE_CODES).toContain('en');
    expect(LANGUAGE_CODES).toContain('fr');
    expect(isLanguageCode('en')).toBe(true);
    expect(isLanguageCode('de')).toBe(false);
    expect(isLanguageCode(7)).toBe(false);
  });
});

describe('custom lists', () => {
  it('folds, de-duplicates, and explains every rejection', () => {
    const { words, rejected } = parseCustomList('crane, SLATE; trail\ntoolong\nfour\ncr4ne\nCRANE');
    expect(words).toEqual(['CRANE', 'SLATE', 'TRAIL']);
    expect(rejected.map((r) => r.word)).toEqual(['toolong', 'four', 'cr4ne', 'CRANE']);
    expect(rejected.find((r) => r.word === 'CRANE')?.reason).toBe('duplicate');
    expect(rejected.find((r) => r.word === 'four')?.reason).toMatch(/needs 5/);
    expect(rejected.find((r) => r.word === 'cr4ne')?.reason).toMatch(/letters only/);
  });

  it('caps the list length', () => {
    // Generate distinct five-letter all-letter words: AAAAA, AAAAB, ...
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const many = Array.from({ length: MAX_CUSTOM_WORDS + 10 }, (_, i) => {
      const a = letters[Math.floor(i / 26) % 26];
      const b = letters[i % 26];
      return `AAA${a}${b}`;
    });
    const { words, rejected } = parseCustomList(many.join(' '));
    expect(words.length).toBe(MAX_CUSTOM_WORDS);
    expect(rejected.some((r) => /limit/.test(r.reason))).toBe(true);
  });

  it('treats an empty submission as "use the language pool"', () => {
    expect(parseCustomList('   ')).toEqual({ words: [], rejected: [] });
  });
});

describe('settings: language and custom words', () => {
  it('switches language and draws answers from it', () => {
    const s = setSettings(initialState(), { language: 'fr' });
    expect(s.settings.language).toBe('fr');
    const game = startGame(s, players, T0, constRng);
    expect(['ARBRE', 'TABLE']).toContain(game.round!.answer);
  });

  it('rejects an unknown language', () => {
    expect(() => setSettings(initialState(), { language: 'de' })).toThrow(/Unknown language/);
  });

  it('uses a custom list as the answer pool, and clears it when emptied', () => {
    const withCustom = setSettings(initialState(), { customWords: 'MOUNT BLAME STERN RAISE AUDIO' });
    expect(withCustom.settings.customWords).toEqual(['MOUNT', 'BLAME', 'STERN', 'RAISE', 'AUDIO']);
    const game = startGame(withCustom, players, T0, constRng);
    expect(withCustom.settings.customWords).toContain(game.round!.answer);

    const cleared = setSettings(withCustom, { customWords: '' });
    expect(cleared.settings.customWords).toEqual([]);
  });

  it('refuses a custom list too short to play', () => {
    expect(() => setSettings(initialState(), { customWords: 'CRANE SLATE' })).toThrow(/at least/);
  });

  it('keeps custom words guessable even when absent from the dictionary', () => {
    const s = setSettings(initialState(), { customWords: 'ZZZZZ QQQQQ XXXXX JJJJJ VVVVV' });
    const game = startGame(s, players, T0, constRng);
    const after = submitGuess(game, 'a', 'QQQQQ', T0 + 1);
    expect(after.round!.boards.a.guesses[0].word).toBe('QQQQQ');
  });
});

describe('wordSourceView', () => {
  it('lists the pool between games and hides it while playing', () => {
    const inLobby = viewFor(initialState(), 'a', T0).wordSource;
    expect(inLobby.custom).toBe(false);
    expect(inLobby.language).toBe('en');
    expect(inLobby.answerCount).toBe(POOL.length);
    expect(inLobby.answers).toEqual(POOL);
    expect(inLobby.guessCount).toBe(TEST_GUESSES.length);

    const playing = viewFor(fresh(), 'a', T0).wordSource;
    expect(playing.answers).toBeNull();
  });

  it('reports a custom pool and counts words the dictionary lacks', () => {
    const s = setSettings(initialState(), { customWords: 'ZZZZZ QQQQQ XXXXX JJJJJ VVVVV' });
    const view = viewFor(s, 'a', T0).wordSource;
    expect(view.custom).toBe(true);
    expect(view.answerCount).toBe(5);
    expect(view.answers).toHaveLength(5);
    expect(view.guessCount).toBe(TEST_GUESSES.length + 5);
  });
});

describe('settings', () => {
  it('validates rounds and round length', () => {
    const s = setSettings(initialState(), { rounds: 5, roundSeconds: 120 });
    expect(s.settings).toEqual({ rounds: 5, roundSeconds: 120, maxGuesses: 6, language: 'en', customWords: [] });
    expect(() => setSettings(initialState(), { rounds: 0 })).toThrow(/Rounds/);
    expect(() => setSettings(initialState(), { rounds: 11 })).toThrow(/Rounds/);
    expect(() => setSettings(initialState(), { roundSeconds: 30 })).toThrow(/Round length/);
    expect(() => setSettings(initialState(), { roundSeconds: 601 })).toThrow(/Round length/);
    expect(() => setSettings(fresh(), { rounds: 2 })).toThrow(/between games/);
  });
});

describe('startGame / dealRound', () => {
  it('deals one answer to everyone with empty boards and a clock', () => {
    const s = fresh();
    expect(s.phase).toBe('playing');
    const r = s.round!;
    expect(r.answer).toBe('CRANE');
    expect(r.participantIds).toEqual(['a', 'b', 'c']);
    expect(Object.keys(r.boards)).toEqual(['a', 'b', 'c']);
    expect(r.endsAt).toBe(T0 + 180_000);
    expect(s.scores).toEqual({ a: 0, b: 0, c: 0 });
    expect(() => startGame(s, players, T0)).toThrow(/already in progress/);
    expect(() => startGame(initialState(), [], T0)).toThrow(/at least 1/);
  });

  it('never repeats an answer within a game', () => {
    let s = fresh();
    const seen = [s.round!.answer];
    for (let i = 1; i < POOL.length; i++) {
      s = { ...s, phase: 'reveal' };
      s = dealRound(s, players, T0, constRng, POOL);
      seen.push(s.round!.answer);
    }
    expect(new Set(seen).size).toBe(POOL.length);
    expect(seen).toEqual(POOL);
  });
});

describe('solving and failing', () => {
  it('marks a player solved with points on the right guess', () => {
    let s = fresh();
    s = submitGuess(s, 'a', 'SLATE', T0 + 1000);
    expect(s.round!.boards.a.status).toBe('solving');
    expect(s.round!.boards.a.guesses[0]).toEqual({ word: 'SLATE', marks: ['x', 'x', 'g', 'x', 'g'] });
    s = submitGuess(s, 'a', 'CRANE', T0 + 2000);
    const board = s.round!.boards.a;
    expect(board.status).toBe('solved');
    expect(board.finishOrder).toBe(1);
    expect(board.points).toBe(50 + 15); // second guess: (7-2)*10 + first-solver bonus
    expect(s.scores.a).toBe(65);
    expect(s.phase).toBe('playing'); // b and c still going
    expect(() => submitGuess(s, 'a', 'TRAIL', T0 + 3000)).toThrow(/already solved/);
  });

  it('fails a player after six wrong guesses and blocks further guesses', () => {
    let s = fresh();
    const wrong = ['ADIEU', 'AUDIO', 'RAISE', 'STERN', 'MOUNT', 'BLAME'];
    wrong.forEach((w, i) => (s = submitGuess(s, 'a', w, T0 + i)));
    expect(s.round!.boards.a.status).toBe('failed');
    expect(s.round!.boards.a.points).toBe(0);
    expect(s.scores.a).toBe(0);
    expect(() => submitGuess(s, 'a', 'CRANE', T0 + 10)).toThrow(/out of guesses/);
  });
});

describe('points and speed bonuses', () => {
  it('scores by guess number plus first/second/third bonus', () => {
    expect(pointsFor(1, 1)).toBe(75);
    expect(pointsFor(3, 2)).toBe(50);
    expect(pointsFor(6, 3)).toBe(15);
    expect(pointsFor(4, 4)).toBe(30);
  });

  it('assigns finish order in solve sequence', () => {
    let s = fresh();
    s = submitGuess(s, 'b', 'CRANE', T0 + 1);
    s = submitGuess(s, 'a', 'SLATE', T0 + 2);
    s = submitGuess(s, 'a', 'CRANE', T0 + 3);
    s = submitGuess(s, 'c', 'CRANE', T0 + 4);
    expect(s.round!.boards.b.finishOrder).toBe(1);
    expect(s.round!.boards.a.finishOrder).toBe(2);
    expect(s.round!.boards.c.finishOrder).toBe(3);
    expect(s.round!.boards.b.points).toBe(60 + 15);
    expect(s.round!.boards.a.points).toBe(50 + 10);
    expect(s.round!.boards.c.points).toBe(60 + 5);
  });
});

describe('round end', () => {
  it('moves to reveal once every participant is solved or failed', () => {
    let s = fresh();
    s = submitGuess(s, 'a', 'CRANE', T0 + 1);
    s = submitGuess(s, 'b', 'CRANE', T0 + 2);
    expect(s.phase).toBe('playing');
    const wrong = ['ADIEU', 'AUDIO', 'RAISE', 'STERN', 'MOUNT', 'BLAME'];
    wrong.forEach((w, i) => (s = submitGuess(s, 'c', w, T0 + 10 + i)));
    expect(s.phase).toBe('reveal');
    expect(s.round!.endReason).toBe('allDone');
    expect(s.round!.revealEndsAt).toBe(T0 + 15 + REVEAL_MS);
    expect(s.roundsPlayed).toBe(1);
  });

  it('ends on time-up, failing anyone still solving', () => {
    let s = fresh();
    s = submitGuess(s, 'a', 'CRANE', T0 + 1);
    expect(isTimeUp(s, T0 + 179_999)).toBe(false);
    expect(timeUp(s, T0 + 179_999)).toBe(s);
    expect(isTimeUp(s, T0 + 180_000)).toBe(true);
    s = timeUp(s, T0 + 180_000);
    expect(s.phase).toBe('reveal');
    expect(s.round!.endReason).toBe('timeUp');
    expect(s.round!.boards.a.status).toBe('solved');
    expect(s.round!.boards.b.status).toBe('failed');
    expect(s.round!.boards.c.status).toBe('failed');
    expect(() => submitGuess(s, 'b', 'CRANE', T0 + 180_001)).toThrow(/not running/);
  });

  it('rejects guesses once the clock has passed even before the timer fires', () => {
    const s = fresh();
    expect(() => submitGuess(s, 'a', 'CRANE', T0 + 180_000)).toThrow(/Time is up/);
  });

  it('advances from reveal to the next round, then to ended after the last round', () => {
    let s = startGame(setSettings(initialState(), { rounds: 2 }), players, T0, constRng, POOL);
    s = submitGuess(s, 'a', 'CRANE', T0 + 1);
    s = timeUp(s, T0 + 180_000);
    expect(() => advance({ ...s, phase: 'playing' }, players, T0)).toThrow(/no reveal/);
    expect(isRevealOver(s, T0 + 180_000 + REVEAL_MS - 1)).toBe(false);
    expect(isRevealOver(s, T0 + 180_000 + REVEAL_MS)).toBe(true);
    s = advance(s, players, T0 + 200_000, constRng, POOL);
    expect(s.phase).toBe('playing');
    expect(s.round!.number).toBe(2);
    expect(s.round!.answer).toBe('SLATE');
    expect(s.scores.a).toBe(75); // carried over
    s = timeUp(s, T0 + 200_000 + 180_000);
    s = advance(s, players, T0 + 400_000, constRng, POOL);
    expect(s.phase).toBe('ended');
    expect(s.round!.answer).toBe('SLATE');
  });

  it('starting again after ended wipes scores and used answers', () => {
    let s = startGame(setSettings(initialState(), { rounds: 1 }), players, T0, constRng, POOL);
    s = submitGuess(s, 'a', 'CRANE', T0 + 1);
    s = timeUp(s, T0 + 180_000);
    s = advance(s, players, T0 + 200_000, constRng, POOL);
    expect(s.phase).toBe('ended');
    const again = startGame(s, players, T0 + 300_000, constRng, POOL);
    expect(again.phase).toBe('playing');
    expect(again.round!.number).toBe(1);
    expect(again.scores).toEqual({ a: 0, b: 0, c: 0 });
    expect(again.usedAnswers).toEqual(['CRANE']);
    expect(reset(again).phase).toBe('lobby');
    expect(reset(again).settings.rounds).toBe(1);
  });
});

describe('leavers', () => {
  it('drops a removed participant and ends the round if the rest are done', () => {
    let s = fresh();
    s = submitGuess(s, 'a', 'CRANE', T0 + 1);
    s = submitGuess(s, 'b', 'CRANE', T0 + 2);
    s = removeParticipant(s, 'c', T0 + 3);
    expect(s.round!.participantIds).toEqual(['a', 'b']);
    expect(s.phase).toBe('reveal');
    expect(s.round!.boards.c.status).toBe('failed');
  });

  it('keeps going while someone is still solving; ignores non-participants', () => {
    let s = fresh();
    const before = s;
    s = removeParticipant(s, 'nobody', T0 + 1);
    expect(s).toBe(before);
    s = removeParticipant(s, 'c', T0 + 1);
    expect(s.phase).toBe('playing');
    expect(s.round!.participantIds).toEqual(['a', 'b']);
  });
});

describe('viewFor', () => {
  it('shows your letters, hides others’ letters until reveal', () => {
    let s = fresh();
    s = submitGuess(s, 'a', 'SLATE', T0 + 1);
    s = submitGuess(s, 'b', 'TRAIL', T0 + 2);
    const va = viewFor(s, 'a', T0 + 3);
    expect(va.round!.answer).toBeNull();
    expect(va.round!.boards.a.guesses[0].word).toBe('SLATE');
    expect(va.round!.boards.b.guesses[0].word).toBeNull();
    expect(va.round!.boards.b.guesses[0].marks).toEqual(scoreGuess('TRAIL', 'CRANE'));
    expect(va.serverNow).toBe(T0 + 3);

    s = timeUp(s, T0 + 180_000);
    const vb = viewFor(s, 'b', T0 + 180_001);
    expect(vb.round!.answer).toBe('CRANE');
    expect(vb.round!.boards.a.guesses[0].word).toBe('SLATE');
    expect(vb.round!.boards.a.status).toBe('failed');
  });
});

describe('filterCandidates (bot helper)', () => {
  it('keeps only words consistent with all feedback so far', () => {
    const guesses = [{ word: 'SLATE', marks: scoreGuess('SLATE', 'CRANE') }];
    const left = filterCandidates(POOL, guesses);
    expect(left).toContain('CRANE');
    expect(left).not.toContain('SLATE');
    expect(left).not.toContain('POINT'); // has no A or E in the right spots
    const narrowed = filterCandidates(left, [...guesses, { word: 'TRAIL', marks: scoreGuess('TRAIL', 'CRANE') }]);
    expect(narrowed).toEqual(['CRANE']);
  });

  it('always keeps the true answer over the full list', () => {
    const answer = 'LEVEL';
    const guesses = ['CRANE', 'SLATE', 'EERIE'].map((w) => ({ word: w, marks: scoreGuess(w, answer) }));
    const left = filterCandidates(ANSWERS, guesses);
    expect(left).toContain(answer);
    expect(left.length).toBeLessThan(ANSWERS.length);
  });
});
