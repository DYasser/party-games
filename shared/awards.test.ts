import { describe, expect, it } from 'vitest';
import { computeAwards, type AwardCandidate } from './awards.js';
import { REACTIONS, REACTION_KEYS, isReactionKey, reactionEmoji } from './celebration.js';

const p = (id: string, score: number, isBot = false): AwardCandidate => ({ id, name: id.toUpperCase(), score, isBot });

describe('computeAwards', () => {
  it('gives nothing when there is nobody to compare against', () => {
    expect(computeAwards([])).toEqual([]);
    expect(computeAwards([p('solo', 40)])).toEqual([]);
  });

  it('spots a win by a hair', () => {
    const awards = computeAwards([p('ann', 21), p('bob', 20), p('cid', 5)]);
    const finish = awards.find((a) => a.key === 'photo-finish');
    expect(finish).toBeDefined();
    expect(finish?.playerId).toBe('ann');
    expect(finish?.note).toContain('BOB');
  });

  it('spots a runaway win instead of a photo finish', () => {
    const awards = computeAwards([p('ann', 100), p('bob', 20), p('cid', 5)]);
    expect(awards.some((a) => a.key === 'landslide')).toBe(true);
    expect(awards.some((a) => a.key === 'photo-finish')).toBe(false);
  });

  it('calls out a bot beating every human', () => {
    const awards = computeAwards([p('byte', 90, true), p('ann', 40), p('bob', 20)]);
    const uprising = awards.find((a) => a.key === 'robot-uprising');
    expect(uprising).toBeDefined();
    expect(uprising?.playerId).toBe('byte');
  });

  it('does not call an uprising when a human is on top', () => {
    const awards = computeAwards([p('ann', 90), p('byte', 40, true), p('bob', 20)]);
    expect(awards.some((a) => a.key === 'robot-uprising')).toBe(false);
  });

  it('awards the wooden spoon to last place, never to the winner', () => {
    const awards = computeAwards([p('ann', 50), p('bob', 30), p('cid', 0)]);
    const spoon = awards.find((a) => a.key === 'wooden-spoon');
    expect(spoon?.playerId).toBe('cid');
    expect(spoon?.note).toMatch(/nothing at all/);
  });

  it('skips the wooden spoon in a two-player game', () => {
    const awards = computeAwards([p('ann', 50), p('bob', 10)]);
    expect(awards.some((a) => a.key === 'wooden-spoon')).toBe(false);
  });

  it('notices when everybody ties', () => {
    const awards = computeAwards([p('ann', 12), p('bob', 12), p('cid', 12)]);
    expect(awards.some((a) => a.key === 'dead-heat')).toBe(true);
  });

  it('does not call a dead heat when everyone scored zero', () => {
    const awards = computeAwards([p('ann', 0), p('bob', 0), p('cid', 0)]);
    expect(awards.some((a) => a.key === 'dead-heat')).toBe(false);
  });

  it('names the middle of a big field', () => {
    const awards = computeAwards([p('a', 60), p('b', 50), p('c', 40), p('d', 30), p('e', 20), p('f', 10)], 8);
    const mid = awards.find((a) => a.key === 'perfectly-average');
    expect(mid?.playerId).toBe('d');
  });

  it('skips the middle award in a small field', () => {
    const awards = computeAwards([p('a', 50), p('b', 30), p('c', 10)], 8);
    expect(awards.some((a) => a.key === 'perfectly-average')).toBe(false);
  });

  it('respects the limit and prefers one award per player', () => {
    const awards = computeAwards([p('ann', 100), p('byte', 60, true), p('bob', 30), p('cid', 0)], 3);
    expect(awards.length).toBeLessThanOrEqual(3);
    const ids = awards.map((a) => a.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('always returns well-formed awards', () => {
    const awards = computeAwards([p('ann', 100), p('byte', 60, true), p('bob', 30), p('cid', 0)]);
    for (const a of awards) {
      expect(a.key).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.note).toBeTruthy();
      expect(a.emoji).toBeTruthy();
      expect(['ann', 'byte', 'bob', 'cid']).toContain(a.playerId);
    }
  });
});

describe('reactions', () => {
  it('exposes a unique key and emoji for every reaction', () => {
    expect(REACTIONS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(REACTION_KEYS).size).toBe(REACTIONS.length);
    expect(new Set(REACTIONS.map((r) => r.emoji)).size).toBe(REACTIONS.length);
    for (const r of REACTIONS) expect(r.label).toBeTruthy();
  });

  it('validates keys coming off the wire', () => {
    expect(isReactionKey('clap')).toBe(true);
    expect(isReactionKey('poke')).toBe(true);
    expect(isReactionKey('nope')).toBe(false);
    expect(isReactionKey(3)).toBe(false);
    expect(isReactionKey(null)).toBe(false);
  });

  it('maps keys to emoji', () => {
    expect(reactionEmoji('clap')).toBe('👏');
    expect(reactionEmoji('poke')).toBe('👉');
  });
});
