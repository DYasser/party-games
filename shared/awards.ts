/**
 * Playful end-of-game awards, derived from the final scores. Every game that
 * shows a podium gets these, so they must work from scores alone; a game may
 * add its own extras on top.
 */

export interface AwardCandidate {
  id: string;
  name: string;
  score: number;
  isBot?: boolean;
}

export interface Award {
  /** Stable key, so the UI can animate a list without reordering surprises. */
  key: string;
  title: string;
  /** One line explaining why they earned it. */
  note: string;
  playerId: string;
  emoji: string;
}

/**
 * Work out which silly titles apply. Returns at most `limit` awards, most
 * interesting first, and never gives the same player two awards unless nobody
 * else qualifies.
 */
export function computeAwards(candidates: AwardCandidate[], limit = 4): Award[] {
  const humans = candidates.filter((c) => !c.isBot);
  // With nobody to compare against, awards are just noise.
  if (candidates.length < 2) return [];

  const sorted = candidates.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = sorted[0];
  const second = sorted[1];
  const last = sorted[sorted.length - 1];
  const scores = sorted.map((c) => c.score);
  const total = scores.reduce((a, b) => a + b, 0);
  const spread = scores[0] - scores[scores.length - 1];

  const pool: Award[] = [];

  // A win by a hair is more fun to point out than a runaway.
  if (second && top.score > second.score && top.score - second.score <= 2 && spread > 0) {
    pool.push({
      key: 'photo-finish',
      title: 'Photo Finish',
      note: `Took it by ${top.score - second.score} with ${second.name} breathing down their neck.`,
      playerId: top.id,
      emoji: '📸',
    });
  }

  // A runaway win deserves its own callout.
  if (second && spread > 0 && top.score >= second.score * 2 && top.score - second.score >= 3) {
    pool.push({
      key: 'landslide',
      title: 'Landslide',
      note: `Finished with more than double ${second.name}'s score. Slightly rude.`,
      playerId: top.id,
      emoji: '🏔️',
    });
  }

  // Beaten by a bot is the funniest possible outcome.
  const bestBot = sorted.find((c) => c.isBot);
  const bestHuman = sorted.find((c) => !c.isBot);
  if (bestBot && bestHuman && bestBot.score > bestHuman.score) {
    pool.push({
      key: 'robot-uprising',
      title: 'Robot Uprising',
      note: `${bestBot.name} beat every human in the room. Nobody talk about this.`,
      playerId: bestBot.id,
      emoji: '🤖',
    });
  }

  // Last place, but only when it is not also first place.
  if (last && last.id !== top.id && sorted.length >= 3) {
    pool.push({
      key: 'wooden-spoon',
      title: 'Wooden Spoon',
      note: last.score === 0 ? 'Finished on nothing at all. Bold strategy.' : 'Last, but present. That counts.',
      playerId: last.id,
      emoji: '🥄',
    });
  }

  // Dead centre of the pack, but only in a field big enough for a "middle".
  if (sorted.length >= 6) {
    const middle = sorted[Math.floor(sorted.length / 2)];
    if (middle.id !== top.id && middle.id !== last.id) {
      pool.push({
        key: 'perfectly-average',
        title: 'Perfectly Average',
        note: 'Bang in the middle. Unremarkable in the most remarkable way.',
        playerId: middle.id,
        emoji: '⚖️',
      });
    }
  }

  // Everyone tied, which is worth noting on its own.
  if (spread === 0 && total > 0) {
    pool.push({
      key: 'dead-heat',
      title: 'Dead Heat',
      note: 'Every single player finished level. Statistically suspicious.',
      playerId: top.id,
      emoji: '🤝',
    });
  }

  // A human who at least beat the bots.
  if (bestHuman && bestBot && bestHuman.score > bestBot.score && humans.length > 0 && bestHuman.id !== top.id) {
    pool.push({
      key: 'carbon-pride',
      title: 'Pride of the Humans',
      note: `Top-scoring human, safely ahead of ${bestBot.name}.`,
      playerId: bestHuman.id,
      emoji: '🧠',
    });
  }

  // Prefer variety: at most one award per player until we run out.
  const chosen: Award[] = [];
  const used = new Set<string>();
  for (const award of pool) {
    if (chosen.length >= limit) break;
    if (used.has(award.playerId)) continue;
    chosen.push(award);
    used.add(award.playerId);
  }
  for (const award of pool) {
    if (chosen.length >= limit) break;
    if (chosen.some((a) => a.key === award.key)) continue;
    chosen.push(award);
  }
  return chosen;
}
