import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import { SPECTRA } from './spectra.js';
import {
  giveClue,
  guessTimeUp,
  initialState,
  isGuessTimeUp,
  isRevealTimeUp,
  lockGuess,
  nextPsychic,
  nextRound,
  pointsForDistance,
  removeParticipant,
  reset,
  revealTimeUp,
  setGuess,
  setSettings,
  setTeam,
  shuffleTeams,
  teamsReady,
  skipPsychic,
  startGame,
  startRound,
  viewFor,
} from './logic.js';
import { GUESS_SECONDS, REVEAL_SECONDS } from './types.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const human = (id: string): BasePlayer => ({ id, name: id.toUpperCase(), connected: true });
const bot = (id: string): BasePlayer => ({ id, name: id, connected: true, isBot: true });
const players: BasePlayer[] = [human('a'), human('b'), human('c'), bot('bot1')];
const T0 = 1_000_000;

function fresh(seed = 1, roster = players) {
  return startGame(setSettings(initialState(), { rounds: 3 }), roster, T0, seeded(seed));
}

/** Drive a fresh round to the guessing phase. */
function guessing(seed = 1, roster = players) {
  const s = fresh(seed, roster);
  return giveClue(s, s.round!.psychicId, 'lukewarm soup', T0);
}

describe('content', () => {
  it('has at least 60 distinct spectrum pairs', () => {
    expect(SPECTRA.length).toBeGreaterThanOrEqual(60);
    const keys = new Set(SPECTRA.map((s) => `${s.left}|${s.right}`));
    expect(keys.size).toBe(SPECTRA.length);
    for (const s of SPECTRA) expect(s.left.trim() && s.right.trim()).toBeTruthy();
  });
});

describe('settings', () => {
  it('accepts 3-20 rounds and rejects the rest', () => {
    expect(setSettings(initialState(), { rounds: 5 }).settings.rounds).toBe(5);
    expect(() => setSettings(initialState(), { rounds: 2 })).toThrow(/between 3 and 20/);
    expect(() => setSettings(initialState(), { rounds: 21 })).toThrow();
    expect(() => setSettings(initialState(), { rounds: 4.5 })).toThrow();
  });

  it('cannot change once the game has started', () => {
    expect(() => setSettings(fresh(), { rounds: 5 })).toThrow(/lobby/);
  });
});

describe('startGame / startRound', () => {
  it('deals a round: human psychic, everyone else guesses, target in range', () => {
    const s = fresh();
    expect(s.phase).toBe('clue');
    const r = s.round!;
    expect(r.number).toBe(1);
    expect(['a', 'b', 'c']).toContain(r.psychicId);
    expect(r.guesserIds).toHaveLength(3);
    expect(r.guesserIds).not.toContain(r.psychicId);
    expect(r.guesserIds).toContain('bot1');
    expect(r.target).toBeGreaterThanOrEqual(0);
    expect(r.target).toBeLessThanOrEqual(100);
    expect(Number.isInteger(r.target)).toBe(true);
    expect(r.clue).toBeNull();
    expect(Object.values(s.scores)).toEqual([0, 0, 0, 0]);
  });

  it('refuses fewer than 3 players, an all-bot room, or a second start', () => {
    expect(() => startGame(initialState(), players.slice(0, 2), T0)).toThrow(/at least 3/);
    expect(() => startGame(initialState(), [bot('x'), bot('y'), bot('z')], T0)).toThrow(/human/);
    expect(() => startGame(fresh(), players, T0)).toThrow(/already/);
  });

  /**
   * The UI draws scoring bands on the spectrum using these exact distances.
   * If the scoring changes, the picture must change with it — this test is the
   * tripwire that says so.
   */
  it('scores by distance in four tight bands: 1, 4, 9, 16', () => {
    const bands: Array<[number, number]> = [
      [1, 4],
      [4, 3],
      [9, 2],
      [16, 1],
    ];
    for (const [reach, points] of bands) {
      expect(pointsForDistance(reach)).toBe(points);
      expect(pointsForDistance(-reach)).toBe(points);
      // One step past the edge drops into the next band down.
      expect(pointsForDistance(reach + 1)).toBe(points - 1);
    }
    expect(pointsForDistance(0)).toBe(4);
    // Past the last band a guess is worth nothing: most of the scale is dead.
    expect(pointsForDistance(17)).toBe(0);
    expect(pointsForDistance(100)).toBe(0);
  });

  it('rotates the psychic among connected humans only, skipping bots', () => {
    const roster = [human('a'), bot('b1'), human('c'), { ...human('d'), connected: false }];
    expect(nextPsychic(roster, null)?.id).toBe('a');
    expect(nextPsychic(roster, 'a')?.id).toBe('c');
    expect(nextPsychic(roster, 'c')?.id).toBe('a');
    expect(nextPsychic([bot('b1'), bot('b2')], null)).toBeNull();
    // A departed previous psychic falls back to the first human.
    expect(nextPsychic(roster, 'gone')?.id).toBe('a');
  });

  it('does not repeat a spectrum until all have been used', () => {
    let s = fresh();
    const seen = new Set<number>(s.usedSpectra);
    const rng = seeded(7);
    for (let i = 0; i < SPECTRA.length - 1; i++) {
      s = startRound({ ...s, phase: 'clue' }, players, T0, rng);
      const idx = s.usedSpectra[s.usedSpectra.length - 1];
      expect(seen.has(idx)).toBe(false);
      seen.add(idx);
    }
    expect(s.usedSpectra).toHaveLength(SPECTRA.length);
    s = startRound(s, players, T0, rng);
    expect(s.usedSpectra).toHaveLength(1); // deck reshuffled
  });
});

describe('clue', () => {
  it('only the psychic may clue, and only during the clue phase', () => {
    const s = fresh();
    const guesser = s.round!.guesserIds[0];
    expect(() => giveClue(s, guesser, 'warm', T0)).toThrow(/psychic/);
    const g = giveClue(s, s.round!.psychicId, '  fairly   warm ', T0);
    expect(g.phase).toBe('guessing');
    expect(g.round!.clue).toBe('fairly warm');
    expect(g.round!.guessEndsAt).toBe(T0 + GUESS_SECONDS * 1000);
    expect(() => giveClue(g, g.round!.psychicId, 'again', T0)).toThrow(/not time/);
  });

  it('rejects empty, too long, or numeric clues', () => {
    const s = fresh();
    const p = s.round!.psychicId;
    expect(() => giveClue(s, p, '   ', T0)).toThrow(/Type a clue/);
    expect(() => giveClue(s, p, 'x'.repeat(41), T0)).toThrow(/40 characters/);
    expect(() => giveClue(s, p, 'about 70 percent', T0)).toThrow(/numbers/);
    expect(() => giveClue(s, p, 'x'.repeat(40), T0)).not.toThrow();
  });
});

describe('guessing', () => {
  it('stores and updates guesses until locked; rejects psychic, outsiders, bad values', () => {
    const s = guessing();
    const [g1] = s.round!.guesserIds;
    let n = setGuess(s, g1, 40);
    expect(n.round!.guesses[g1]).toEqual({ value: 40, locked: false });
    n = setGuess(n, g1, 55);
    expect(n.round!.guesses[g1].value).toBe(55);
    expect(() => setGuess(n, s.round!.psychicId, 50)).toThrow(/not guessing/);
    expect(() => setGuess(n, 'stranger', 50)).toThrow(/not guessing/);
    expect(() => setGuess(n, g1, 101)).toThrow(/0 to 100/);
    expect(() => setGuess(n, g1, -1)).toThrow();
    expect(() => setGuess(n, g1, 12.5)).toThrow();
    expect(() => setGuess(fresh(), g1, 50)).toThrow(/not open/);
  });

  it('requires a guess before locking and freezes the guess afterwards', () => {
    const s = guessing();
    const [g1] = s.round!.guesserIds;
    expect(() => lockGuess(s, g1, T0)).toThrow(/Move the needle/);
    const locked = lockGuess(setGuess(s, g1, 20), g1, T0);
    expect(locked.round!.guesses[g1].locked).toBe(true);
    expect(() => setGuess(locked, g1, 30)).toThrow(/already locked/);
    expect(() => lockGuess(locked, g1, T0)).toThrow(/already locked/);
    expect(locked.phase).toBe('guessing');
  });

  it('reveals and scores when the last guesser locks', () => {
    const s = guessing();
    const target = s.round!.target;
    const [g1, g2, g3] = s.round!.guesserIds;
    let n = lockGuess(setGuess(s, g1, target), g1, T0); // exact hit: 4 points
    n = lockGuess(setGuess(n, g2, Math.min(100, target + 10)), g2, T0); // 1 point (or fewer if clamped)
    expect(n.phase).toBe('guessing');
    n = lockGuess(setGuess(n, g3, target > 50 ? 0 : 100), g3, T0 + 5000); // 0 points (distance >= 50)
    expect(n.phase).toBe('reveal');
    const r = n.round!;
    expect(r.points![g1]).toBe(4);
    expect(r.points![g2]).toBe(pointsForDistance(Math.min(100, target + 10) - target));
    expect(r.points![g3]).toBe(0);
    const avg = (r.points![g1] + r.points![g2] + r.points![g3]) / 3;
    expect(r.psychicPoints).toBe(Math.round(avg));
    expect(n.scores[r.psychicId]).toBe(Math.round(avg));
    expect(n.scores[g1]).toBe(4);
    expect(n.roundsPlayed).toBe(1);
    expect(r.revealEndsAt).toBe(T0 + 5000 + REVEAL_SECONDS * 1000);
  });

  it('ignores disconnected guessers when checking for all locked', () => {
    const s = guessing();
    const [g1, g2, g3] = s.round!.guesserIds;
    let n = lockGuess(setGuess(s, g1, 10), g1, T0, (id) => id !== g3);
    expect(n.phase).toBe('guessing');
    n = lockGuess(setGuess(n, g2, 10), g2, T0, (id) => id !== g3);
    expect(n.phase).toBe('reveal');
    expect(n.round!.points![g3]).toBe(0); // never guessed
  });

  it('reveals when the 60s timer runs out, scoring 0 for missing guesses', () => {
    const s = guessing();
    const [g1] = s.round!.guesserIds;
    const n = setGuess(s, g1, s.round!.target);
    expect(isGuessTimeUp(n, T0 + 59_000)).toBe(false);
    expect(guessTimeUp(n, T0 + 59_000)).toBe(n);
    const r = guessTimeUp(n, T0 + 60_000);
    expect(r.phase).toBe('reveal');
    expect(r.round!.points![g1]).toBe(4);
    expect(Object.values(r.round!.points!).filter((p) => p === 0)).toHaveLength(2);
    // Psychic average only counts guessers who actually guessed.
    expect(r.round!.psychicPoints).toBe(4);
  });
});

describe('game modes', () => {
  const four: BasePlayer[] = [
    { id: 'a', name: 'Ann', connected: true },
    { id: 'b', name: 'Bob', connected: true },
    { id: 'c', name: 'Cid', connected: true },
    { id: 'd', name: 'Dee', connected: true },
  ];

  it('rejects an unknown mode and defaults to classic', () => {
    expect(initialState().settings.mode).toBe('classic');
    expect(setSettings(initialState(), { mode: 'blind' }).settings.mode).toBe('blind');
    expect(() => setSettings(initialState(), { mode: 'chaos' })).toThrow(/mode/i);
  });

  it('blind mode hides the two ends from everyone, including the psychic', () => {
    let s = setSettings(initialState(), { rounds: 3, mode: 'blind' });
    s = startGame(s, four, T0, seeded(4));
    const psychicId = s.round!.psychicId;
    const guesserId = s.round!.guesserIds[0];

    // Neither side is told what the scale means while the round is live.
    expect(viewFor(s, psychicId, T0).round!.spectrum).toBeNull();
    expect(viewFor(s, guesserId, T0).round!.spectrum).toBeNull();
    // The psychic still sees the target: that is what they are describing.
    expect(viewFor(s, psychicId, T0).round!.target).toBe(s.round!.target);

    // Once the round is scored there is nothing left to protect.
    s = giveClue(s, psychicId, 'halfway', T0);
    s = lockGuess(setGuess(s, guesserId, 50), guesserId, T0);
    for (const id of s.round!.guesserIds) {
      if (!s.round!.guesses[id]?.locked) s = lockGuess(setGuess(s, id, 50), id, T0);
    }
    expect(s.phase).toBe('reveal');
    expect(viewFor(s, guesserId, T0).round!.spectrum).not.toBeNull();
  });

  it('classic mode always shows the ends', () => {
    const s = startGame(setSettings(initialState(), { rounds: 3 }), four, T0, seeded(4));
    expect(viewFor(s, s.round!.guesserIds[0], T0).round!.spectrum).not.toBeNull();
  });

  it('team mode alternates sides and only the team on turn guesses', () => {
    let s = setSettings(initialState(), { rounds: 4, mode: 'teams' });
    s = setTeam(s, 'a', 'red');
    s = setTeam(s, 'b', 'red');
    s = setTeam(s, 'c', 'blue');
    s = setTeam(s, 'd', 'blue');
    s = startGame(s, four, T0, seeded(9));

    expect(s.round!.team).toBe('red');
    // Only red plays: the psychic and the guessers are all red.
    expect(s.teams[s.round!.psychicId]).toBe('red');
    expect(s.round!.guesserIds.every((id) => s.teams[id] === 'red')).toBe(true);

    // Score the round, then the next one belongs to blue.
    s = giveClue(s, s.round!.psychicId, 'clue', T0);
    for (const id of s.round!.guesserIds) s = lockGuess(setGuess(s, id, s.round!.target), id, T0);
    expect(s.phase).toBe('reveal');
    expect(s.teamScores.red).toBeGreaterThan(0);
    expect(s.teamScores.blue).toBe(0);

    s = nextRound(s, four, T0, seeded(10));
    expect(s.round!.team).toBe('blue');
    expect(s.round!.guesserIds.every((id) => s.teams[id] === 'blue')).toBe(true);
  });

  it('will not start a team game with a side that cannot play', () => {
    let s = setSettings(initialState(), { rounds: 3, mode: 'teams' });
    s = setTeam(s, 'a', 'red');
    s = setTeam(s, 'b', 'red');
    s = setTeam(s, 'c', 'red');
    s = setTeam(s, 'd', 'red');
    // Everyone on one side: blue has nobody at all.
    expect(teamsReady(s, four)).toMatch(/blue/i);
    expect(() => startGame(s, four, T0, seeded(1))).toThrow(/blue/i);

    // A side of one cannot both give the clue and guess.
    let t = setSettings(initialState(), { rounds: 3, mode: 'teams' });
    t = setTeam(t, 'a', 'red');
    t = setTeam(t, 'b', 'red');
    t = setTeam(t, 'c', 'red');
    t = setTeam(t, 'd', 'blue');
    expect(teamsReady(t, four)).toMatch(/two players/i);
  });

  it('shuffles everyone onto a side, and teams lock once running', () => {
    let s = setSettings(initialState(), { rounds: 3, mode: 'teams' });
    s = shuffleTeams(s, four, seeded(5));
    expect(Object.keys(s.teams)).toHaveLength(4);
    expect(Object.values(s.teams).filter((t) => t === 'red')).toHaveLength(2);
    expect(Object.values(s.teams).filter((t) => t === 'blue')).toHaveLength(2);

    const running = startGame(s, four, T0, seeded(6));
    expect(() => setTeam(running, 'a', 'blue')).toThrow(/locked/i);
    expect(() => shuffleTeams(running, four)).toThrow(/locked/i);
  });

  it('refuses team calls outside team mode', () => {
    const classic = initialState();
    expect(() => setTeam(classic, 'a', 'red')).toThrow(/team mode/i);
    expect(() => shuffleTeams(classic, four)).toThrow(/team mode/i);
  });
});

describe('scoring table', () => {
  it('maps distance to points', () => {
    expect(pointsForDistance(0)).toBe(4);
    expect(pointsForDistance(1)).toBe(4);
    expect(pointsForDistance(-2)).toBe(3);
    expect(pointsForDistance(4)).toBe(3);
    expect(pointsForDistance(5)).toBe(2);
    expect(pointsForDistance(9)).toBe(2);
    expect(pointsForDistance(10)).toBe(1);
    expect(pointsForDistance(16)).toBe(1);
    expect(pointsForDistance(17)).toBe(0);
    expect(pointsForDistance(100)).toBe(0);
  });
});

describe('round flow', () => {
  function revealed(seed = 1) {
    const s = guessing(seed);
    return guessTimeUp(s, T0 + 60_000);
  }

  it('next round rotates the psychic and keeps cumulative scores; ends after the last round', () => {
    let s = revealed();
    const firstPsychic = s.round!.psychicId;
    expect(() => nextRound(fresh(), players, T0)).toThrow(/still in progress/);
    s = nextRound(s, players, T0, seeded(3));
    expect(s.phase).toBe('clue');
    expect(s.round!.number).toBe(2);
    expect(s.round!.psychicId).not.toBe(firstPsychic);
    expect(s.round!.psychicId).not.toBe('bot1');
    const scoresBefore = { ...s.scores };

    s = giveClue(s, s.round!.psychicId, 'medium', T0);
    s = guessTimeUp(s, T0 + 60_000);
    s = nextRound(s, players, T0);
    expect(s.round!.number).toBe(3);
    s = giveClue(s, s.round!.psychicId, 'spicy', T0);
    s = guessTimeUp(s, T0 + 60_000);
    expect(s.roundsPlayed).toBe(3);
    for (const id of Object.keys(scoresBefore)) expect(s.scores[id]).toBeGreaterThanOrEqual(scoresBefore[id]);
    s = nextRound(s, players, T0);
    expect(s.phase).toBe('ended');
    expect(s.round!.revealEndsAt).toBeNull();
  });

  it('auto-advances from the reveal after 12s', () => {
    const s = revealed();
    const endsAt = s.round!.revealEndsAt!;
    expect(isRevealTimeUp(s, endsAt - 1)).toBe(false);
    expect(revealTimeUp(s, players, endsAt - 1)).toBe(s);
    const n = revealTimeUp(s, players, endsAt);
    expect(n.phase).toBe('clue');
    expect(n.round!.number).toBe(2);
  });

  it('reset returns to the lobby keeping settings and wiping scores', () => {
    const s = reset(revealed());
    expect(s.phase).toBe('lobby');
    expect(s.settings.rounds).toBe(3);
    expect(s.scores).toEqual({});
    expect(s.round).toBeNull();
    expect(s.roundsPlayed).toBe(0);
  });
});

describe('leavers', () => {
  it('skips to the next human psychic when the psychic disconnects during the clue phase', () => {
    const s = fresh();
    const psychic = s.round!.psychicId;
    const roster = players.map((p) => (p.id === psychic ? { ...p, connected: false } : p));
    expect(skipPsychic(s, players, T0)).toBe(s); // psychic still here: no-op
    const n = skipPsychic(s, roster, T0, seeded(9));
    expect(n.phase).toBe('clue');
    expect(n.round!.psychicId).not.toBe(psychic);
    expect(n.round!.psychicId).not.toBe('bot1');
    expect(n.round!.number).toBe(1);
    expect(n.round!.guesserIds).not.toContain(n.round!.psychicId);
    expect(n.usedSpectra).toHaveLength(1);
    expect(() => skipPsychic(guessing(), roster, T0)).toThrow(/before the clue/);
  });

  it('ends the game when no human is left to be psychic', () => {
    const s = fresh();
    const roster = players.map((p) => (p.isBot ? p : { ...p, connected: false }));
    expect(skipPsychic(s, roster, T0).phase).toBe('ended');
  });

  it('drops a departed guesser and reveals if everyone else had locked', () => {
    const s = guessing();
    const [g1, g2, g3] = s.round!.guesserIds;
    let n = lockGuess(setGuess(s, g1, 50), g1, T0);
    n = lockGuess(setGuess(n, g2, 50), g2, T0);
    expect(n.phase).toBe('guessing');
    const roster = players.filter((p) => p.id !== g3);
    n = removeParticipant(n, g3, roster, T0);
    expect(n.phase).toBe('reveal');
    expect(n.round!.guesserIds).toEqual([g1, g2]);
    expect(n.round!.points![g3]).toBeUndefined();
  });

  it('removing the psychic mid-guessing keeps the round going; leaving in the lobby is a no-op', () => {
    const s = guessing();
    const psychic = s.round!.psychicId;
    const n = removeParticipant(s, psychic, players.filter((p) => p.id !== psychic), T0);
    expect(n).toBe(s);
    const lobby = initialState();
    expect(removeParticipant(lobby, 'a', players, T0)).toBe(lobby);
  });

  it('solo mode: one human psychic with only bots as guessers', () => {
    const roster = [human('h'), bot('b1'), bot('b2')];
    let s = fresh(1, roster);
    expect(s.round!.psychicId).toBe('h');
    expect(s.round!.guesserIds).toEqual(['b1', 'b2']);
    s = giveClue(s, 'h', 'chilly', T0);
    s = lockGuess(setGuess(s, 'b1', 50), 'b1', T0);
    s = lockGuess(setGuess(s, 'b2', 50), 'b2', T0);
    expect(s.phase).toBe('reveal');
    s = nextRound(s, roster, T0);
    expect(s.round!.psychicId).toBe('h'); // still the only human
  });
});

describe('viewFor', () => {
  it('hides the target from guessers and other players guesses until the reveal', () => {
    const s = guessing();
    const psychic = s.round!.psychicId;
    const [g1, g2] = s.round!.guesserIds;
    const n = setGuess(setGuess(s, g1, 30), g2, 70);

    const pv = viewFor(n, psychic, T0);
    expect(pv.round!.isPsychic).toBe(true);
    expect(pv.round!.target).toBe(n.round!.target);
    expect(pv.round!.guesses[g1].value).toBeNull();
    expect(pv.serverNow).toBe(T0);

    const gv = viewFor(n, g1, T0);
    expect(gv.round!.isPsychic).toBe(false);
    expect(gv.round!.target).toBeNull();
    expect(gv.round!.guesses[g1]).toEqual({ value: 30, locked: false });
    expect(gv.round!.guesses[g2]).toEqual({ value: null, locked: false });
    expect(gv.round!.clue).toBe('lukewarm soup');

    const r = guessTimeUp(n, T0 + 60_000);
    const rv = viewFor(r, g1, T0);
    expect(rv.round!.target).toBe(r.round!.target);
    expect(rv.round!.guesses[g2].value).toBe(70);
    expect(rv.round!.points).toBeTruthy();
  });
});
