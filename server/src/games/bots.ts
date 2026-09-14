import { UserError } from '../../../shared/errors.js';
import type { BasePlayer, Room } from '../../../shared/room.js';

const BOT_NAMES = ['Byte', 'Pixel', 'Nova', 'Glitch', 'Echo', 'Bolt', 'Neon', 'Vex', 'Juno', 'Rook', 'Flux', 'Zed'];

export function makeBot(room: Room): BasePlayer {
  const taken = new Set(room.players.map((p) => p.name));
  const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${room.players.length + 1}`;
  return { id: `bot-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`, name, connected: true, isBot: true };
}

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
export const chance = (p: number) => Math.random() < p;

/** A bot's next move: how long to "think", then what to do. */
export interface BotPlan {
  delayMs: number;
  run(): void;
}

/**
 * One pending bot action per room. Each call to `tick` replaces the previous
 * pending action, so the plan is always based on the freshest state.
 */
export class BotScheduler<P extends BasePlayer, S> {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private plan: (room: Room<P, S>) => BotPlan | null) {}

  tick(room: Room<P, S>, broadcast: (room: Room<P, S>) => void): void {
    this.cancel(room.code);
    const next = this.plan(room);
    if (!next) return;
    this.timers.set(
      room.code,
      setTimeout(() => {
        this.timers.delete(room.code);
        // Re-plan at fire time: a human may have acted in the meantime.
        const fresh = this.plan(room);
        try {
          fresh?.run();
        } catch (err) {
          if (!(err instanceof UserError)) console.error('[bot]', err);
        }
        broadcast(room); // also re-ticks, scheduling the next move
      }, next.delayMs),
    );
  }

  cancel(code: string): void {
    const t = this.timers.get(code);
    if (t) clearTimeout(t);
    this.timers.delete(code);
  }
}
