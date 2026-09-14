/**
 * Card faces.
 *
 * Emoji: they are things players can name, which is what makes a board
 * memorable — "the cat next to the rocket" is something you can hold in your
 * head. No assets to ship or license, and they render everywhere.
 *
 * Chosen to be easy to tell apart at a glance: no two that differ only by
 * colour, and no near-duplicate shapes. 50 symbols covers the largest board
 * (10x10 needs 50 pairs).
 */
export const SYMBOLS: readonly string[] = [
  '🐱', '🚀', '🔑', '⚓', '👑',
  '🐟', '🌲', '🏠', '🐦', '☕',
  '⏰', '🔔', '⛵', '🌻', '📚',
  '☂️', '🎸', '📷', '💡', '🎈',
  '🍎', '🍌', '🍇', '🍉', '🍒',
  '🥑', '🌽', '🍄', '🌵', '🍁',
  '🌊', '🔥', '⭐', '🌙', '⚡',
  '❄️', '🎁', '🎺', '🥁', '🎲',
  '🧩', '🪁', '🚂', '✈️', '🏰',
  '🧭', '💎', '🪙', '🐙', '🦋',
];

/** How many distinct symbols a board of this size needs. */
export function pairsFor(size: number): number {
  return (size * size) / 2;
}
