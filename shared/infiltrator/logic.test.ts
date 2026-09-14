import { describe, expect, it } from 'vitest';
import type { BasePlayer } from '../room.js';
import { LOCATION_NAMES } from './locations.js';
import {
  accuse,
  finalVote,
  initialState,
  isTimeUp,
  removeParticipant,
  setSettings,
  spyGuess,
  startRound,
  tallyFinalVotes,
  timeUp,
  viewFor,
  voteAccusation,
} from './logic.js';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const players: BasePlayer[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), connected: true }));
const T0 = 1_000_000;

function fresh(seed = 1) {
  return startRound(initialState(), players, T0, seeded(seed));
}

describe('startRound', () => {
  it('picks one spy, gives everyone else a role, sets the clock', () => {
    const s = fresh();
    expect(s.phase).toBe('playing');
    const r = s.round!;
    expect(players.map((p) => p.id)).toContain(r.spyId);
    expect(Object.keys(r.roles)).toHaveLength(3);
    expect(r.roles[r.spyId]).toBeUndefined();
    expect(r.endsAt).toBe(T0 + 8 * 60 * 1000);
    expect(Object.values(s.scores)).toEqual([0, 0, 0, 0]);
  });

  it('refuses fewer than 3 players', () => {
    expect(() => startRound(initialState(), players.slice(0, 2), T0)).toThrow(/at least 3/);
  });

  it('respects round length settings', () => {
    const s = startRound(setSettings(initialState(), 120), players, T0, seeded());
    expect(s.round!.endsAt).toBe(T0 + 120_000);
    expect(() => setSettings(initialState(), 10)).toThrow();
  });
});

describe('viewFor', () => {
  it('hides the location from the spy and the spy from everyone until the end', () => {
    const s = fresh();
    const spy = s.round!.spyId;
    const other = players.find((p) => p.id !== spy)!.id;
    const spyView = viewFor(s, spy, T0);
    expect(spyView.round!.isSpy).toBe(true);
    expect(spyView.round!.location).toBeNull();
    expect(spyView.round!.spyId).toBeNull();
    const agentView = viewFor(s, other, T0);
    expect(agentView.round!.isSpy).toBe(false);
    expect(agentView.round!.location).toBe(s.round!.location);
    expect(agentView.round!.role).toBe(s.round!.roles[other]);
    expect(agentView.round!.spyId).toBeNull();
  });
});

describe('accusations', () => {
  it('unanimous vote on the spy wins for agents and scores accuser extra', () => {
    let s = fresh();
    const spy = s.round!.spyId;
    const agents = players.map((p) => p.id).filter((id) => id !== spy);
    s = accuse(s, agents[0], spy, T0 + 1000);
    expect(s.round!.pausedAt).toBe(T0 + 1000);
    expect(() => voteAccusation(s, spy, true, T0)).toThrow(/accused/);
    s = voteAccusation(s, agents[1], true, T0 + 2000);
    expect(s.phase).toBe('playing');
    s = voteAccusation(s, agents[2], true, T0 + 3000);
    expect(s.phase).toBe('ended');
    expect(s.round!.result).toMatchObject({ winner: 'agents', reason: 'caught', accusedId: spy });
    expect(s.scores[agents[0]]).toBe(2);
    expect(s.scores[agents[1]]).toBe(1);
    expect(s.scores[spy]).toBe(0);
  });

  it('a no vote cancels the accusation and resumes the clock with time added back', () => {
    let s = fresh();
    const spy = s.round!.spyId;
    const agents = players.map((p) => p.id).filter((id) => id !== spy);
    const endsAt = s.round!.endsAt;
    s = accuse(s, agents[0], agents[1], T0 + 1000);
    s = voteAccusation(s, agents[2], false, T0 + 6000);
    expect(s.round!.accusation).toBeNull();
    expect(s.round!.pausedAt).toBeNull();
    expect(s.round!.endsAt).toBe(endsAt + 5000);
    expect(() => accuse(s, agents[0], spy, T0)).toThrow(/already made/);
  });

  it('convicting an innocent gives the spy 4 points', () => {
    let s = fresh();
    const spy = s.round!.spyId;
    const agents = players.map((p) => p.id).filter((id) => id !== spy);
    s = accuse(s, agents[0], agents[1], T0);
    s = voteAccusation(s, agents[2], true, T0);
    s = voteAccusation(s, spy, true, T0);
    expect(s.round!.result).toMatchObject({ winner: 'spy', reason: 'wrongAccusation' });
    expect(s.scores[spy]).toBe(4);
  });
});

describe('spy guess', () => {
  it('right guess wins 4, wrong guess loses', () => {
    let s = fresh();
    const spy = s.round!.spyId;
    const other = players.find((p) => p.id !== spy)!.id;
    expect(() => spyGuess(s, other, s.round!.location)).toThrow(/spy/);
    const right = spyGuess(s, spy, s.round!.location.toLowerCase());
    expect(right.round!.result).toMatchObject({ winner: 'spy', reason: 'spyGuessedRight' });
    expect(right.scores[spy]).toBe(4);

    const wrongName = LOCATION_NAMES.find((n) => n !== s.round!.location)!;
    const wrong = spyGuess(s, spy, wrongName);
    expect(wrong.round!.result).toMatchObject({ winner: 'agents', reason: 'spyGuessedWrong' });
  });
});

describe('time up and final vote', () => {
  it('moves to voting when the clock runs out, unless paused', () => {
    let s = fresh();
    const end = s.round!.endsAt;
    expect(isTimeUp(s, end - 1)).toBe(false);
    expect(timeUp(s, end - 1).phase).toBe('playing');
    const spy = s.round!.spyId;
    const agents = players.map((p) => p.id).filter((id) => id !== spy);
    const paused = accuse(s, agents[0], agents[1], end - 10);
    expect(timeUp(paused, end + 1000).phase).toBe('playing');
    s = timeUp(s, end);
    expect(s.phase).toBe('voting');
  });

  it('plurality on the spy catches them; tie or miss means spy wins', () => {
    let s = timeUp(fresh(), fresh().round!.endsAt);
    const spy = s.round!.spyId;
    const agents = players.map((p) => p.id).filter((id) => id !== spy);
    s = finalVote(s, agents[0], spy);
    s = finalVote(s, agents[1], spy);
    s = finalVote(s, agents[2], agents[0]);
    expect(s.phase).toBe('voting');
    s = finalVote(s, spy, agents[0]); // 2 vs 2 would tie, but agents[2] + spy = 2 on agents[0], 2 on spy
    expect(s.phase).toBe('ended');
    expect(s.round!.result!.reason).toBe('timeUp');

    let t = timeUp(fresh(), fresh().round!.endsAt);
    t = finalVote(t, agents[0], spy);
    t = finalVote(t, agents[1], spy);
    t = tallyFinalVotes(t);
    expect(t.round!.result).toMatchObject({ winner: 'agents', reason: 'caught', accusedId: spy });
  });
});

describe('removeParticipant', () => {
  it('spy leaving hands the round to the agents', () => {
    const s = fresh();
    const out = removeParticipant(s, s.round!.spyId);
    expect(out.phase).toBe('ended');
    expect(out.round!.result).toMatchObject({ winner: 'agents', reason: 'spyLeft' });
  });

  it('an agent leaving during an accusation can complete the vote', () => {
    let s = fresh();
    const spy = s.round!.spyId;
    const agents = players.map((p) => p.id).filter((id) => id !== spy);
    s = accuse(s, agents[0], spy, T0);
    s = voteAccusation(s, agents[1], true, T0);
    s = removeParticipant(s, agents[2]);
    expect(s.phase).toBe('ended');
    expect(s.round!.result!.reason).toBe('caught');
  });
});
