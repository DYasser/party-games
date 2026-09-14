import { describe, expect, it } from 'vitest';
import { REACTION_BURST, REACTION_BURST_WINDOW_MS } from '../../shared/celebration.js';
import { ReactionLimiter } from './celebration.js';

describe('ReactionLimiter', () => {
  it('allows a first throw', () => {
    const limiter = new ReactionLimiter();
    expect(limiter.allow('a', 1000)).toBe(true);
  });

  it('allows a whole burst back-to-back, so rapid tapping feels good', () => {
    const limiter = new ReactionLimiter();
    let allowed = 0;
    // Same millisecond for every throw: the worst case for a naive limiter.
    for (let i = 0; i < REACTION_BURST; i++) if (limiter.allow('a', 1000)) allowed++;
    expect(allowed).toBe(REACTION_BURST);
  });

  it('caps anything past the burst inside the window', () => {
    const limiter = new ReactionLimiter();
    let allowed = 0;
    for (let i = 0; i < REACTION_BURST + 20; i++) if (limiter.allow('a', 1000)) allowed++;
    expect(allowed).toBe(REACTION_BURST);
  });

  it('refills as the window slides forward', () => {
    const limiter = new ReactionLimiter();
    for (let i = 0; i < REACTION_BURST; i++) limiter.allow('a', 1000);
    expect(limiter.allow('a', 1000)).toBe(false);
    // Just before the window expires, still blocked.
    expect(limiter.allow('a', 1000 + REACTION_BURST_WINDOW_MS - 1)).toBe(false);
    // Once the first throws age out, capacity returns.
    expect(limiter.allow('a', 1000 + REACTION_BURST_WINDOW_MS)).toBe(true);
  });

  it('tracks players independently', () => {
    const limiter = new ReactionLimiter();
    for (let i = 0; i < REACTION_BURST; i++) limiter.allow('a', 1000);
    expect(limiter.allow('a', 1000)).toBe(false);
    expect(limiter.allow('b', 1000)).toBe(true);
  });

  it('forgets a player who leaves', () => {
    const limiter = new ReactionLimiter();
    for (let i = 0; i < REACTION_BURST; i++) limiter.allow('a', 1000);
    expect(limiter.allow('a', 1000)).toBe(false);
    limiter.forget('a');
    expect(limiter.allow('a', 1000)).toBe(true);
  });
});
