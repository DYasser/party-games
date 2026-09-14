import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import {
  enterReview,
  guessMatches,
  hintProblem,
  initialState,
  isTimeUp,
  nextCard,
  normalizeWord,
  passCard,
  presenceCheck,
  rating,
  removeParticipant,
  setReady,
  startGame,
  submitGuess,
  submitHint,
  survivingHints,
  timeUp,
  toggleCancel,
  viewFor,
} from './logic.js';
import { DECK_SIZE, type OneWordState, GUESS_SECONDS, HINT_SECONDS, RESULT_SECONDS, REVIEW_SECONDS } from './types.js';
import { ALL_WORDS, WORD_GROUPS, themeOf } from './words.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const ids = ['a', 'b', 'c', 'd'];
const players: BasePlayer[] = ids.map((id) => ({ id, name: id.toUpperCase(), connected: true }));
const T0 = 1_000_000;
const WORDS = ['elephant', 'kettle', 'rocket', 'trophy', 'guitar', 'thunder', 'sweater', 'hammer', 'passport', 'coral', 'dragon', 'pencil', 'tulip', 'taxi', 'popcorn'];

function fresh(seed = 1): OneWordState {
  return startGame(initialState(), players, T0, seeded(seed), WORDS);
}

function hinters(s: OneWordState): string[] {
  return s.card!.hinterIds;
}

/** Run a card through hinting -> review with distinct valid hints from every hinter. */
function withHints(s: OneWordState, texts?: string[]): OneWordState {
  const hs = hinters(s);
  const pool = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  let next = s;
  hs.forEach((id, i) => {
    next = submitHint(next, id, texts?.[i] ?? pool[i], ids, T0 + i);
  });
  return next;
}

function toGuessing(s: OneWordState, texts?: string[]): OneWordState {
  let next = withHints(s, texts);
  expect(next.phase).toBe('review');
  for (const id of hinters(next)) next = setReady(next, id, ids, T0 + 10);
  expect(next.phase).toBe('guessing');
  return next;
}

describe('words', () => {
  it('ships at least 12 themed groups of 15-25 words each', () => {
    expect(WORD_GROUPS.length).toBeGreaterThanOrEqual(12);
    for (const g of WORD_GROUPS) {
      expect(g.words.length).toBeGreaterThanOrEqual(15);
      expect(g.words.length).toBeLessThanOrEqual(25);
      expect(new Set(g.words).size).toBe(g.words.length);
    }
    expect(ALL_WORDS.length).toBeGreaterThan(DECK_SIZE);
    expect(themeOf('Rocket')).toBe('Space');
    expect(themeOf('nonsenseword')).toBeNull();
  });
});

describe('normalizeWord', () => {
  it('treats case, punctuation and simple plurals as the same', () => {
    expect(normalizeWord(' Cats ')).toBe('cat');
    expect(normalizeWord('cat')).toBe('cat');
    expect(normalizeWord('Boxes')).toBe('box');
    expect(normalizeWord('puppies')).toBe('puppy');
    expect(normalizeWord('glass')).toBe('glass');
    expect(normalizeWord("o'clock")).toBe('oclock');
    expect(normalizeWord('bus')).toBe('bus');
  });
});

describe('startGame', () => {
  it('deals 13 distinct words, seats everyone, and starts hinting with a clock', () => {
    const s = fresh();
    expect(s.phase).toBe('hinting');
    expect(s.deck).toHaveLength(DECK_SIZE);
    expect(new Set(s.deck).size).toBe(DECK_SIZE);
    expect(s.outcomes).toEqual(Array(DECK_SIZE).fill(null));
    expect(s.participantIds).toEqual(ids);
    expect(s.card!.guesserId).toBe('a');
    expect(s.card!.hinterIds).toEqual(['b', 'c', 'd']);
    expect(s.phaseEndsAt).toBe(T0 + HINT_SECONDS * 1000);
    expect(s.score).toBe(0);
  });

  it('refuses fewer than three players and mid-game restarts', () => {
    expect(() => startGame(initialState(), players.slice(0, 2), T0)).toThrow(/at least 3/);
    expect(() => startGame(fresh(), players, T0)).toThrow(/already in progress/);
  });
});

describe('hints', () => {
  it('rejects the secret word, substrings in either direction, plurals, and bad characters', () => {
    expect(hintProblem('notebook', 'notebook')).toMatch(/too close/);
    expect(hintProblem('notebook', 'NoteBook')).toMatch(/too close/);
    expect(hintProblem('notebook', 'book')).toMatch(/too close/);
    expect(hintProblem('note', 'notebook')).toMatch(/too close/);
    expect(hintProblem('rocket', 'rockets')).toMatch(/too close/);
    expect(hintProblem('rocket', 'two words')).toMatch(/one word/);
    expect(hintProblem('rocket', 'sp4ce')).toMatch(/Letters/);
    expect(hintProblem('rocket', '')).toMatch(/one word/);
    expect(hintProblem('rocket', 'a'.repeat(21))).toMatch(/at most/);
    expect(hintProblem('rocket', "space-ship's")).toBeNull();
  });

  it('only hinters may hint, and the guesser may not', () => {
    const s = fresh();
    expect(() => submitHint(s, 'a', 'alpha', ids, T0)).toThrow(/guesser/);
    expect(() => submitHint(s, 'zzz', 'alpha', ids, T0)).toThrow(/not a hinter/);
    const secret = s.card!.word;
    expect(() => submitHint(s, 'b', secret, ids, T0)).toThrow(/too close/);
  });

  it('lets a hinter change their hint until everyone has submitted, then moves to review', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ids, T0);
    s = submitHint(s, 'b', 'bravo', ids, T0);
    expect(s.phase).toBe('hinting');
    expect(s.card!.hints.b.text).toBe('bravo');
    s = submitHint(s, 'c', 'charlie', ids, T0);
    expect(s.phase).toBe('hinting');
    s = submitHint(s, 'd', 'delta', ids, T0 + 5);
    expect(s.phase).toBe('review');
    expect(s.phaseEndsAt).toBe(T0 + 5 + REVIEW_SECONDS * 1000);
    expect(() => submitHint(s, 'b', 'late', ids, T0)).toThrow(/closed/);
  });

  it('ignores disconnected hinters when checking whether everyone has submitted', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ['a', 'b', 'c'], T0);
    s = submitHint(s, 'c', 'bravo', ['a', 'b', 'c'], T0);
    expect(s.phase).toBe('review');
    expect(Object.keys(s.card!.hints)).toEqual(['b', 'c']);
  });

  it('presenceCheck closes hinting when the last missing hinter drops', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ids, T0);
    s = submitHint(s, 'c', 'bravo', ids, T0);
    expect(presenceCheck(s, ids, T0)).toBe(s);
    const after = presenceCheck(s, ['a', 'b', 'c'], T0);
    expect(after.phase).toBe('review');
  });
});

describe('review', () => {
  it('auto-cancels hints that match after normalization (case, plural)', () => {
    const s = withHints(fresh(), ['Stars', 'star', 'Moon']);
    expect(s.phase).toBe('review');
    expect(s.card!.hints.b).toMatchObject({ cancelled: true, duplicate: true });
    expect(s.card!.hints.c).toMatchObject({ cancelled: true, duplicate: true });
    expect(s.card!.hints.d).toMatchObject({ cancelled: false, duplicate: false });
    expect(survivingHints(s.card!).map((h) => h.text)).toEqual(['Moon']);
  });

  it('lets any hinter toggle-cancel a hint, but never un-cancel a duplicate', () => {
    let s = withHints(fresh(), ['star', 'star', 'moon']);
    s = toggleCancel(s, 'b', 'd');
    expect(s.card!.hints.d.cancelled).toBe(true);
    s = toggleCancel(s, 'c', 'd');
    expect(s.card!.hints.d.cancelled).toBe(false);
    expect(() => toggleCancel(s, 'b', 'b')).toThrow(/Duplicate/);
    expect(() => toggleCancel(s, 'a', 'd')).toThrow(/Only hinters/);
    expect(() => toggleCancel(s, 'b', 'zzz')).toThrow(/did not write/);
  });

  it('moves to guessing once every present hinter is ready, or when the clock runs out', () => {
    let s = withHints(fresh());
    expect(() => setReady(s, 'a', ids, T0)).toThrow(/Only hinters/);
    s = setReady(s, 'b', ids, T0);
    s = setReady(s, 'b', ids, T0); // idempotent
    expect(s.card!.ready).toEqual(['b']);
    s = setReady(s, 'c', ids, T0);
    expect(s.phase).toBe('review');
    // d disconnected: presence check lets the card through.
    const viaPresence = presenceCheck(s, ['a', 'b', 'c'], T0 + 1);
    expect(viaPresence.phase).toBe('guessing');
    expect(viaPresence.phaseEndsAt).toBe(T0 + 1 + GUESS_SECONDS * 1000);
    // or the review timer.
    expect(isTimeUp(s, s.phaseEndsAt! - 1)).toBe(false);
    const viaTimer = timeUp(s, ids, s.phaseEndsAt!);
    expect(viaTimer.phase).toBe('guessing');
  });
});

describe('guessing', () => {
  it('a correct guess (case/plural-insensitive) scores a point and reveals the card', () => {
    const s = toGuessing(fresh());
    const secret = s.card!.word;
    expect(() => submitGuess(s, 'b', secret, T0)).toThrow(/Only the guesser/);
    expect(() => submitGuess(s, 'a', '   ', T0)).toThrow(/Type a guess/);
    expect(guessMatches('rocket', ' ROCKETS ')).toBe(true);
    const after = submitGuess(s, 'a', ` ${secret.toUpperCase()}s `, T0 + 20);
    expect(after.phase).toBe('result');
    expect(after.score).toBe(1);
    expect(after.card!.outcome).toBe('success');
    expect(after.outcomes[0]).toBe('success');
    expect(after.outcomes[1]).toBeNull();
    expect(after.phaseEndsAt).toBe(T0 + 20 + RESULT_SECONDS * 1000);
  });

  it('a wrong guess fails the card and discards the next one', () => {
    const s = toGuessing(fresh());
    const after = submitGuess(s, 'a', 'definitelywrong', T0);
    expect(after.card!.outcome).toBe('fail');
    expect(after.score).toBe(0);
    expect(after.outcomes.slice(0, 3)).toEqual(['fail', 'discarded', null]);
    const next = nextCard(after, T0);
    expect(next.card!.index).toBe(2);
    expect(next.card!.guesserId).toBe('b');
    expect(next.card!.hinterIds).toEqual(['a', 'c', 'd']);
  });

  it('a wrong guess on the last card has nothing left to discard', () => {
    let s = fresh();
    s = { ...s, outcomes: s.outcomes.map((_, i) => (i === 12 ? null : 'pass')), card: { ...s.card!, index: 12, word: s.deck[12] } };
    s = toGuessing(s);
    const after = submitGuess(s, 'a', 'nope', T0);
    expect(after.outcomes[12]).toBe('fail');
    expect(after.outcomes.filter((o) => o === 'discarded')).toHaveLength(0);
  });

  it('passing loses only that card', () => {
    const s = toGuessing(fresh());
    expect(() => passCard(s, 'b', T0)).toThrow(/Only the guesser/);
    const after = passCard(s, 'a', T0);
    expect(after.phase).toBe('result');
    expect(after.card!.outcome).toBe('pass');
    expect(after.outcomes.slice(0, 2)).toEqual(['pass', null]);
    expect(after.score).toBe(0);
    expect(nextCard(after, T0).card!.index).toBe(1);
  });

  it('the guess clock auto-passes (covers a guesser who disconnected)', () => {
    const s = toGuessing(fresh());
    expect(timeUp(s, ids, s.phaseEndsAt! - 1)).toBe(s);
    const after = timeUp(s, ids, s.phaseEndsAt!);
    expect(after.phase).toBe('result');
    expect(after.card!.outcome).toBe('pass');
  });

  it('the hinting clock closes hinting even with missing hints', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ids, T0);
    const after = timeUp(s, ids, s.phaseEndsAt!);
    expect(after.phase).toBe('review');
    expect(Object.keys(after.card!.hints)).toEqual(['b']);
  });
});

describe('deck and rotation', () => {
  it('rotates the guesser through every seat and ends when the deck is exhausted', () => {
    let s = fresh();
    const guessers: string[] = [];
    let cards = 0;
    while (s.phase !== 'ended') {
      guessers.push(s.card!.guesserId);
      s = toGuessing(s);
      s = submitGuess(s, s.card!.guesserId, s.card!.word, T0);
      s = timeUp(s, ids, s.phaseEndsAt!); // result clock -> next card
      cards++;
    }
    expect(cards).toBe(DECK_SIZE);
    expect(s.score).toBe(DECK_SIZE);
    expect(guessers.slice(0, 5)).toEqual(['a', 'b', 'c', 'd', 'a']);
    expect(s.outcomes.every((o) => o === 'success')).toBe(true);
    expect(s.gamesPlayed).toBe(1);
    expect(viewFor(s, 'a', T0).rating).toBe('Perfect!');
    expect(() => nextCard(s, T0)).toThrow(/not finished/);
  });

  it('wrong guesses shrink the deck by two, so fewer than 13 cards get played', () => {
    let s = fresh();
    let cards = 0;
    while (s.phase !== 'ended') {
      s = toGuessing(s);
      s = submitGuess(s, s.card!.guesserId, 'wrong', T0);
      s = nextCard(s, T0);
      cards++;
    }
    expect(cards).toBe(7); // 6 fails burn 12 cards, the 13th fails alone
    expect(s.score).toBe(0);
    expect(s.outcomes.filter((o) => o === 'fail')).toHaveLength(7);
    expect(s.outcomes.filter((o) => o === 'discarded')).toHaveLength(6);
  });

  it('rates the final score', () => {
    expect(rating(13)).toBe('Perfect!');
    expect(rating(12)).toBe('Awesome');
    expect(rating(11)).toBe('Awesome');
    expect(rating(9)).toBe('Great');
    expect(rating(7)).toBe('Good');
    expect(rating(4)).toBe('Not bad');
    expect(rating(3)).toBe('Try again');
  });
});

describe('leavers', () => {
  it('drops a hinter and closes hinting if they were the last one missing', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ids, T0);
    s = submitHint(s, 'c', 'bravo', ids, T0);
    const after = removeParticipant(s, 'd', ['a', 'b', 'c'], T0);
    expect(after.participantIds).toEqual(['a', 'b', 'c']);
    expect(after.card!.hinterIds).toEqual(['b', 'c']);
    expect(after.phase).toBe('review');
  });

  it('burns the card when the guesser leaves, and the next seat guesses next', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ids, T0);
    const after = removeParticipant(s, 'a', ['b', 'c', 'd'], T0);
    expect(after.phase).toBe('result');
    expect(after.card!.outcome).toBe('discarded');
    expect(after.outcomes[0]).toBe('discarded');
    const next = nextCard(after, T0);
    expect(next.card!.guesserId).toBe('b');
    expect(next.card!.hinterIds).toEqual(['c', 'd']);
  });

  it('keeps the rotation on the right seat when an earlier seat leaves', () => {
    let s = fresh();
    s = toGuessing(s);
    s = passCard(s, 'a', T0);
    s = nextCard(s, T0); // b guesses
    expect(s.card!.guesserId).toBe('b');
    s = removeParticipant(s, 'a', ['b', 'c', 'd'], T0); // a leaves while hinting
    expect(s.card!.hinterIds).toEqual(['c', 'd']);
    s = toGuessing(s);
    s = passCard(s, 'b', T0);
    s = nextCard(s, T0);
    expect(s.card!.guesserId).toBe('c');
  });

  it('ends the game when fewer than two players remain', () => {
    let s = startGame(initialState(), players.slice(0, 3), T0, seeded(1), WORDS);
    s = removeParticipant(s, 'b', ['a', 'c'], T0);
    expect(s.phase).toBe('hinting');
    s = removeParticipant(s, 'c', ['a'], T0);
    expect(s.phase).toBe('ended');
  });
});

describe('viewFor', () => {
  it('hides the word and hints from the guesser until the reveal', () => {
    let s = fresh();
    s = submitHint(s, 'b', 'alpha', ids, T0);
    let g = viewFor(s, 'a', T0);
    let h = viewFor(s, 'b', T0);
    expect(g.card!.word).toBeNull();
    expect(h.card!.word).toBe(s.card!.word);
    expect(g.card!.hints).toBeNull();
    expect(h.card!.hints).toBeNull(); // other hinters' text stays hidden while hinting
    expect(h.card!.yourHint).toBe('alpha');
    expect(g.card!.submittedIds).toEqual(['b']);
    expect((g as unknown as { deck?: unknown }).deck).toBeUndefined();

    s = withHints(s, ['alpha', 'star', 'star']);
    g = viewFor(s, 'a', T0);
    h = viewFor(s, 'c', T0);
    expect(g.card!.hints).toBeNull();
    expect(h.card!.hints).toHaveLength(3);
    expect(h.card!.hints!.filter((x) => x.duplicate)).toHaveLength(2);

    for (const id of hinters(s)) s = setReady(s, id, ids, T0);
    g = viewFor(s, 'a', T0);
    expect(g.phase).toBe('guessing');
    expect(g.card!.hints!.map((x) => x.text)).toEqual(['alpha']);
    expect(g.card!.word).toBeNull();

    s = passCard(s, 'a', T0);
    g = viewFor(s, 'a', T0);
    expect(g.card!.word).toBe(s.card!.word);
    expect(g.card!.hints).toHaveLength(3);
    expect(g.card!.outcome).toBe('pass');
  });
});
