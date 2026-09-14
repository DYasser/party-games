import { REACTION_BURST, REACTION_BURST_WINDOW_MS } from '../../shared/celebration.js';

/**
 * Throttles a player's celebration reactions. Reactions are relayed to the whole
 * room, so an unthrottled client could spam every other player's screen. A
 * rolling window caps the volume without punishing rapid tapping, which is the
 * fun part: fire a dozen at once, then wait a moment for the window to slide.
 */
export class ReactionLimiter {
  /** playerId -> timestamps of recent throws, newest last. */
  private recent = new Map<string, number[]>();

  /** True when this throw is allowed; records it as a side effect. */
  allow(playerId: string, now = Date.now()): boolean {
    // Drop throws that have slid out of the window, then check what is left.
    const times = (this.recent.get(playerId) ?? []).filter((t) => now - t < REACTION_BURST_WINDOW_MS);

    if (times.length >= REACTION_BURST) {
      this.recent.set(playerId, times);
      return false;
    }

    times.push(now);
    this.recent.set(playerId, times);
    return true;
  }

  /** Drop a player's history when they leave, so the map cannot grow forever. */
  forget(playerId: string): void {
    this.recent.delete(playerId);
  }
}
