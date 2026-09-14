// End-to-end smoke test for Pair Rush. Requires the server on :3001 (npm run dev:server).
import { assert, connect, playerId, req, settle } from './e2e-lib.mjs';

const ids = ['ann', 'bob'].map((n) => playerId(`pr-${n}`));
const names = ['Ann', 'Bob'];

const socks = await Promise.all(ids.map(() => connect()));
const [a, b] = socks;
const latest = socks.map(() => null);
socks.forEach((s, i) => s.on('room:state', (v) => (latest[i] = v)));

const { code } = await req(a, 'room:create', { game: 'pairrush', name: names[0], playerId: ids[0] });
console.log('room created', code);
await req(b, 'room:join', { code, name: names[1], playerId: ids[1] });

// Settings are host-only and validated.
await req(b, 'pairrush:settings', { size: 4 }).then(
  () => assert(false, 'non-host settings'),
  (e) => console.log('non-host settings rejected:', e.message),
);
await req(a, 'pairrush:settings', { size: 7 }).then(
  () => assert(false, 'bad size'),
  (e) => console.log('bad size rejected:', e.message),
);
await req(a, 'pairrush:settings', { size: 4, roundSeconds: 120 });

// Wrong-game events must bounce.
await req(a, 'infiltrator:start').then(
  () => assert(false, 'wrong game'),
  (e) => console.log('wrong-game event rejected:', e.message),
);

await req(b, 'pairrush:start').then(
  () => assert(false, 'non-host start'),
  (e) => console.log('non-host start rejected:', e.message),
);

await req(a, 'pairrush:start');
await settle();

const view = latest[0];
assert(view.state.phase === 'playing', 'phase playing');
assert(view.state.cards.length === 16, '4x4 deals 16 cards');
assert(view.state.pairsTotal === 8, '8 pairs');
assert(
  view.state.cards.every((c) => c.symbol === null),
  'nothing is revealed before you flip it',
);
console.log('dealt', view.state.cards.length, 'cards,', view.state.pairsTotal, 'pairs');

// Flipping one card reveals exactly that card, and only to its owner.
await req(a, 'pairrush:flip', { index: 0 });
await settle();
assert(latest[0].state.cards[0].symbol !== null, 'Ann sees her own flip');
assert(latest[0].state.cards.filter((c) => c.symbol !== null).length === 1, 'only one card is up');
assert(latest[1].state.cards[0].symbol === null, 'Bob cannot see Ann\'s flip');
console.log('per-player reveal holds');

// Rivals show progress but never card positions.
const bobSeesAnn = latest[1].state.rivals.find((r) => r.name === 'Ann');
assert(bobSeesAnn !== undefined, 'Bob sees Ann as a rival');
assert(!('matched' in bobSeesAnn), 'rival view carries no card indices');
console.log('rival view:', JSON.stringify(bobSeesAnn));

// Out-of-range and repeat flips are refused.
await req(a, 'pairrush:flip', { index: 999 }).then(
  () => assert(false, 'off-board flip'),
  (e) => console.log('off-board flip rejected:', e.message),
);
await req(a, 'pairrush:flip', { index: 0 }).then(
  () => assert(false, 'same card twice'),
  (e) => console.log('repeat flip rejected:', e.message),
);

/**
 * Clear Ann's board.
 *
 * The client is never told the whole deck, so the only honest way to solve it
 * is the way a player would: turn cards over and remember what came back.
 */
const known = new Map(); // index -> symbol
let flips = 0;

async function reveal(index) {
  await req(a, 'pairrush:flip', { index });
  flips++;
  await settle(30);
  const card = latest[0].state.cards[index];
  if (card.symbol) known.set(index, card.symbol);
  return card.symbol;
}

// Card 0 is already face-up from the checks above.
known.set(0, latest[0].state.cards[0].symbol);

let guard = 0;
while (latest[0].state.pairsFound < 8 && guard++ < 400) {
  const state = latest[0].state;
  const done = new Set(state.cards.map((c, i) => (c.matched ? i : -1)).filter((i) => i >= 0));
  const up = state.cards.map((c, i) => (c.flipped ? i : -1)).filter((i) => i >= 0);

  // Wait out a mismatch rather than fighting the lock.
  if (up.length === 2) {
    await settle(950);
    continue;
  }

  if (up.length === 1) {
    const want = state.cards[up[0]].symbol;
    const partner = [...known].find(([i, s]) => s === want && i !== up[0] && !done.has(i));
    await reveal(partner ? partner[0] : firstUnknown(state, done, known, up));
    continue;
  }

  // Nothing up: go for a remembered pair, else explore.
  const bySymbol = new Map();
  for (const [i, s] of known) {
    if (done.has(i)) continue;
    bySymbol.set(s, [...(bySymbol.get(s) ?? []), i]);
  }
  const ready = [...bySymbol.values()].find((list) => list.length >= 2);
  if (ready) {
    await reveal(ready[0]);
    await reveal(ready[1]);
  } else {
    await reveal(firstUnknown(state, done, known, up));
  }
}

function firstUnknown(state, done, mem, up) {
  for (let i = 0; i < state.cards.length; i++) {
    if (done.has(i) || up.includes(i) || mem.has(i)) continue;
    return i;
  }
  // Everything is known; fall back to any free card.
  for (let i = 0; i < state.cards.length; i++) {
    if (!done.has(i) && !up.includes(i)) return i;
  }
  return 0;
}

await settle(200);
assert(latest[0].state.pairsFound === 8, `Ann cleared the board (got ${latest[0].state.pairsFound})`);
assert(latest[0].state.finishOrder === 1, 'Ann finished first');
console.log(`Ann cleared 8 pairs in ${flips} flips, place #${latest[0].state.finishOrder}`);

// Bob is still solving, so the race is not over.
assert(latest[0].state.phase === 'playing', 'race continues while Bob solves');
await req(a, 'pairrush:flip', { index: 0 }).then(
  () => assert(false, 'finished player kept flipping'),
  (e) => console.log('post-finish flip rejected:', e.message),
);

/*
 * A dropped player keeps their seat for a two-minute reconnect grace period, so
 * disconnecting does not end the race immediately — that is deliberate. What
 * matters is that the room does not wedge: Ann stays finished, Bob is shown as
 * away, and the host can still get everyone back to the lobby.
 */
b.disconnect();
await settle(400);
assert(latest[0].state.phase === 'playing', 'a disconnect alone does not end the race');
const bobRow = latest[0].state.rivals.find((r) => r.name === 'Bob');
assert(bobRow && bobRow.connected === false, 'Bob is shown as away, not deleted');
console.log('disconnect handled: Bob is away, race still live');

// Reset always works, so a room can never be stuck waiting on someone who left.
await req(a, 'pairrush:reset');
await settle();
assert(latest[0].state.phase === 'lobby', 'back to lobby');
console.log('host reset recovered the room');

socks.forEach((s) => s.disconnect());
console.log('\nPAIR RUSH E2E PASSED');
process.exit(0);
