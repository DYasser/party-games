/**
 * End-of-game celebration: the transient, purely-for-fun layer that sits on top
 * of any game's results screen. Reactions are ephemeral (never stored in game
 * state) and are relayed to everyone in the room.
 */

/** The emoji you can fling at another player. */
export const REACTIONS = [
  { key: 'clap', emoji: '👏', label: 'Nice one' },
  { key: 'fire', emoji: '🔥', label: 'On fire' },
  { key: 'crown', emoji: '👑', label: 'Bow down' },
  { key: 'mind', emoji: '🤯', label: 'Mind blown' },
  { key: 'laugh', emoji: '😂', label: 'Comedy gold' },
  { key: 'shock', emoji: '😱', label: 'How?!' },
  { key: 'poke', emoji: '👉', label: 'Poke' },
  { key: 'sus', emoji: '🤨', label: 'Suspicious' },
  { key: 'salt', emoji: '🧂', label: 'Salty' },
  { key: 'snail', emoji: '🐌', label: 'Too slow' },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]['key'];

export const REACTION_KEYS = REACTIONS.map((r) => r.key) as ReactionKey[];

export function isReactionKey(value: unknown): value is ReactionKey {
  return typeof value === 'string' && (REACTION_KEYS as string[]).includes(value);
}

export function reactionEmoji(key: ReactionKey): string {
  return REACTIONS.find((r) => r.key === key)?.emoji ?? '❓';
}

/** A reaction in flight, relayed to every client in the room. */
export interface ReactionEvent {
  /** Who threw it. */
  fromId: string;
  fromName: string;
  /** Who it was aimed at. */
  toId: string;
  which: ReactionKey;
  /** Server timestamp, so late arrivals can ignore stale throws. */
  at: number;
}

/** Everyone can fire the confetti cannon; the whole room sees it. */
export interface ConfettiEvent {
  fromId: string;
  fromName: string;
  at: number;
}

/**
 * How fast one player may throw reactions, enforced server-side. Rapid tapping
 * is the whole point, so there is no minimum gap between throws: a rolling
 * window is the only limit, which lets a player empty their burst instantly and
 * then refill as it slides forward.
 */
export const REACTION_BURST = 12;
export const REACTION_BURST_WINDOW_MS = 3000;
/** Reactions older than this are dropped by the client animation layer. */
export const REACTION_TTL_MS = 4000;
