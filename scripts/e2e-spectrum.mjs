// End-to-end smoke test for Spectrum: a human host plus three bots play a 3-round game (the minimum).
// Run against your own server: PORT=3101 npx tsx server/src/index.ts, then E2E_URL=http://localhost:3101 node scripts/e2e-spectrum.mjs
import { readFileSync } from 'node:fs';
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

/*
 * A copy of shared/spectrum/logic.ts `pointsForDistance`. This is plain Node so
 * it cannot import the TypeScript source; the check below reads the real table
 * out of that file and fails loudly if the two ever disagree, which is exactly
 * what happened when the bands were retuned.
 */
const pointsFor = (d) => (d <= 2 ? 4 : d <= 6 ? 3 : d <= 12 ? 2 : d <= 20 ? 1 : 0);

{
  const src = readFileSync(new URL('../shared/spectrum/logic.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function pointsForDistance'));
  // Stop at the closing brace; no newline literal needed.
  const end = body.indexOf('return 0;');
  const real = [...body.slice(0, end).matchAll(/d <= (\d+)\) return (\d+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  assert(real.length > 0, 'could not read the scoring table out of logic.ts');
  for (const [reach, points] of real) {
    assert(
      pointsFor(reach) === points,
      `scoring table drifted: logic.ts says ${reach} -> +${points}, this script says +${pointsFor(reach)}`,
    );
  }
  console.log('scoring table matches logic.ts:', real.map(([d, p]) => `${d}:+${p}`).join(' '));
}

const hostId = 'spectrum-host-0001';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

/** Poll the latest view until `pred` holds, or fail after `timeoutMs`. */
async function waitFor(pred, label, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (latest && pred(latest)) return latest;
    await settle(100);
  }
  throw new Error(`ASSERT: timed out waiting for ${label} (phase=${latest?.state?.phase})`);
}


// ---- Lobby ----
const { code } = await req(sock, 'room:create', { game: 'spectrum', name: 'Human', playerId: hostId });
console.log('spectrum room', code);
await settle();
assert(latest.game === 'spectrum' && latest.state.phase === 'lobby', 'lobby view');
assert(latest.state.settings.rounds === 8, 'default 8 rounds');

await rejects(req(sock, 'spectrum:start'), 'start alone');
await rejects(req(sock, 'spectrum:settings', { rounds: 2 }), 'too few rounds');
await rejects(req(sock, 'spectrum:settings', { rounds: 25 }), 'too many rounds');
await req(sock, 'spectrum:settings', { rounds: 3 });
await settle();
assert(latest.state.settings.rounds === 3, 'rounds set to 3');

await rejects(req(sock, 'infiltrator:start'), 'infiltrator event in spectrum room');

for (let i = 0; i < 3; i++) await req(sock, 'room:addBot');
await settle();
const botIds = latest.players.filter((p) => p.isBot).map((p) => p.id);
assert(botIds.length === 3, 'three bots seated');
await rejects(req(sock, 'spectrum:clue', { text: 'early' }), 'clue before start');

// ---- Round 1 ----
await req(sock, 'spectrum:start');
await settle();
let s = latest.state;
assert(s.phase === 'clue' && s.round.number === 1, 'round 1 in clue phase');
assert(s.round.psychicId === hostId && s.round.isPsychic, 'the only human is the psychic');
assert(Number.isInteger(s.round.target) && s.round.target >= 0 && s.round.target <= 100, 'psychic sees target');
assert(s.round.guesserIds.length === 3 && botIds.every((id) => s.round.guesserIds.includes(id)), 'bots are the guessers');
assert(s.round.spectrum.left && s.round.spectrum.right, 'spectrum pair present');
assert(Object.values(s.scores).every((v) => v === 0), 'scores start at 0');
console.log(`round 1: "${s.round.spectrum.left}" <-> "${s.round.spectrum.right}", target ${s.round.target}`);

await rejects(req(sock, 'spectrum:settings', { rounds: 4 }), 'settings mid-game');
await rejects(req(sock, 'spectrum:clue', { text: 'about 40' }), 'clue with digits');
await rejects(req(sock, 'spectrum:clue', { text: '' }), 'empty clue');
await rejects(req(sock, 'spectrum:guess', { value: 50 }), 'psychic guessing');
await rejects(req(sock, 'spectrum:next'), 'next before reveal');
await req(sock, 'spectrum:clue', { text: 'lukewarm soup' });
await settle();
s = latest.state;
assert(s.phase === 'guessing' && s.round.clue === 'lukewarm soup', 'guessing opened with clue');
assert(Math.abs(s.round.guessEndsAt - (s.serverNow + 60_000)) < 2000, '60s guessing clock');
await rejects(req(sock, 'spectrum:lock'), 'psychic locking');

// Bots peek at the target and lock in one by one.
await waitFor((v) => v.state.phase === 'reveal', 'bots to lock in and reveal', 25_000);
s = latest.state;
const r1 = s.round;
console.log('round 1 reveal: target', r1.target, 'guesses', botIds.map((id) => `${r1.guesses[id]?.value}(+${r1.points[id]})`).join(' '));
assert(botIds.every((id) => r1.guesses[id]?.locked && Number.isInteger(r1.guesses[id].value)), 'all bot guesses locked + visible');
let sum = 0;
for (const id of botIds) {
  const expected = pointsFor(Math.abs(r1.guesses[id].value - r1.target));
  assert(r1.points[id] === expected, `points for ${id}: ${r1.points[id]} vs ${expected}`);
  assert(s.scores[id] === expected, 'bot cumulative score after round 1');
  sum += expected;
}
assert(r1.psychicPoints === Math.round(sum / 3), 'psychic gets the rounded average');
assert(s.scores[hostId] === r1.psychicPoints, 'psychic cumulative score after round 1');
assert(s.roundsPlayed === 1, 'one round played');
assert(Math.abs(r1.revealEndsAt - (s.serverNow + 12_000)) < 3000, '12s reveal clock');
const scoresAfter1 = { ...s.scores };
await rejects(req(sock, 'spectrum:lock'), 'lock during reveal');

// Reveal auto-advances without the host pressing anything.
console.log('waiting for the reveal to auto-advance...');
await waitFor((v) => v.state.phase === 'clue' && v.state.round.number === 2, 'auto-advance to round 2', 16_000);
s = latest.state;
assert(s.round.psychicId === hostId, 'host is psychic again (only human)');
assert(s.round.clue === null && Object.keys(s.round.guesses).length === 0, 'fresh round');
assert(s.round.spectrum.left !== r1.spectrum.left || s.round.spectrum.right !== r1.spectrum.right, 'new spectrum pair');
console.log(`round 2: "${s.round.spectrum.left}" <-> "${s.round.spectrum.right}", target ${s.round.target}`);

// ---- Round 2 ----
await req(sock, 'spectrum:clue', { text: 'a bit further along' });
await waitFor((v) => v.state.phase === 'reveal', 'round 2 reveal', 25_000);
s = latest.state;
const r2 = s.round;
assert(r2.number === 2 && s.roundsPlayed === 2, 'round 2 revealed');
let sum2 = 0;
for (const id of botIds) {
  const expected = pointsFor(Math.abs(r2.guesses[id].value - r2.target));
  assert(r2.points[id] === expected, 'round 2 points');
  assert(s.scores[id] === scoresAfter1[id] + expected, 'bot scores accumulate');
  sum2 += expected;
}
assert(r2.psychicPoints === Math.round(sum2 / 3), 'psychic average round 2');
assert(s.scores[hostId] === scoresAfter1[hostId] + r2.psychicPoints, 'psychic score accumulates');
console.log('round 2 reveal: target', r2.target, 'scores', s.scores);

// Host advances manually into round 3.
const scoresAfter2 = { ...s.scores };
await req(sock, 'spectrum:next');
await settle();
s = latest.state;
assert(s.phase === 'clue' && s.round.number === 3, 'host advanced to round 3');
await req(sock, 'spectrum:clue', { text: 'nearly all the way' });
await waitFor((v) => v.state.phase === 'reveal', 'round 3 reveal', 25_000);
s = latest.state;
const r3 = s.round;
let sum3 = 0;
for (const id of botIds) {
  const expected = pointsFor(Math.abs(r3.guesses[id].value - r3.target));
  assert(r3.points[id] === expected, 'round 3 points');
  assert(s.scores[id] === scoresAfter2[id] + expected, 'bot scores accumulate in round 3');
  sum3 += expected;
}
assert(r3.psychicPoints === Math.round(sum3 / 3), 'psychic average round 3');
console.log('round 3 reveal: target', r3.target, 'scores', s.scores);

// After the final round, next ends the game.
await req(sock, 'spectrum:next');
await settle();
s = latest.state;
assert(s.phase === 'ended', 'game ended after 3 rounds');
assert(s.roundsPlayed === 3, 'three rounds played');
assert(s.round.revealEndsAt === null, 'no auto-advance from ended');
const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
const expectedTotal = sum + sum2 + sum3 + r1.psychicPoints + r2.psychicPoints + r3.psychicPoints;
assert(total === expectedTotal, `leaderboard total ${total} matches ${expectedTotal}`);
console.log('final scores', s.scores);

await rejects(req(sock, 'spectrum:next'), 'next when ended');
await rejects(req(sock, 'spectrum:start'), 'start when ended');

// Play again: back to the lobby, players kept, scores wiped, settings kept.
await req(sock, 'spectrum:reset');
await settle();
s = latest.state;
assert(s.phase === 'lobby' && Object.keys(s.scores).length === 0, 'reset to lobby with no scores');
assert(s.settings.rounds === 3 && s.round === null, 'settings kept, round cleared');
assert(latest.players.length === 4, 'players kept through reset');

console.log('\nSPECTRUM E2E PASSED');
sock.disconnect();
process.exit(0);
