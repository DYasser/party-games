// End-to-end smoke test for Letter Rush: a human host + 3 bots play one full round.
// Usage: PORT=3104 npx tsx server/src/index.ts   then   E2E_URL=http://localhost:3104 node scripts/e2e-letterrush.mjs
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const hostId = 'human-host-lr-0001';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

async function waitFor(pred, label, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (latest && pred(latest)) return latest;
    await settle(100);
  }
  throw new Error(`TIMEOUT waiting for ${label} (phase=${latest?.state?.phase})`);
}

// ---- Lobby ----
const { code } = await req(sock, 'room:create', { game: 'letterrush', name: 'Human', playerId: hostId });
console.log('letter rush room', code);
await rejects(req(sock, 'letterrush:start'), 'start alone');
for (let i = 0; i < 3; i++) await req(sock, 'room:addBot');
await settle();
const bots = latest.players.filter((p) => p.isBot);
assert(bots.length === 3, 'three bots seated');
assert(latest.state.phase === 'lobby', 'in lobby');

await rejects(req(sock, 'letterrush:settings', { rounds: 0, roundSeconds: 30 }), 'rounds=0');
await rejects(req(sock, 'letterrush:settings', { rounds: 1, roundSeconds: 10 }), 'roundSeconds=10');
await req(sock, 'letterrush:settings', { rounds: 1, roundSeconds: 30 });
await settle();
assert(latest.state.settings.rounds === 1 && latest.state.settings.roundSeconds === 30, 'settings applied');
assert(latest.state.settings.categoriesPerRound === 6, 'six categories per round');

// ---- Writing ----
await req(sock, 'letterrush:start');
await settle();
assert(latest.state.phase === 'writing', 'writing phase');
const round = latest.state.round;
const L = round.letter;
assert(/^[A-Z]$/.test(L) && !'QXZ'.includes(L), `letter ${L} is playable`);
assert(round.categories.length === 6 && new Set(round.categories).size === 6, 'six distinct categories');
assert(round.participantIds.length === 4, 'four participants');
assert(Object.keys(round.answers).join() === hostId, 'only my own answers are visible while writing');
assert(round.endsAt - latest.state.serverNow <= 30_000 && round.endsAt - latest.state.serverNow > 25_000, 'writing clock is ~30s');
console.log(`letter ${L}; categories: ${round.categories.join(' | ')}`);

// Five valid answers (one with a leading article, one lowercase) and one wrong-letter answer.
const myAnswers = [`${L}ovely thing`, `the ${L}ittle one`, `${L.toLowerCase()}ow key`, `${L}ucky ${L}`, `${L}emon-ish`, 'zzz wrong letter'];
for (let i = 0; i < 6; i++) await req(sock, 'letterrush:answer', { categoryIndex: i, text: myAnswers[i] });
await settle();
const mine = latest.state.round.answers[hostId];
assert(mine[0] === myAnswers[0] && mine[1] === myAnswers[1] && mine[2] === myAnswers[2], 'valid answers stored verbatim');
assert(mine[5] === '', 'wrong-letter answer stored as blank');
await rejects(req(sock, 'letterrush:answer', { categoryIndex: 9, text: `${L}x` }), 'bad category index');
await rejects(req(sock, 'letterrush:flag', { categoryIndex: 0, playerId: bots[0].id }), 'flag during writing');

await req(sock, 'letterrush:done');
await settle();
assert(latest.state.round.doneWriting.includes(hostId), 'host marked done');
await rejects(req(sock, 'letterrush:answer', { categoryIndex: 0, text: `${L}ate edit` }), 'answer after done');

console.log('waiting for bots to finish writing (3-10s each)...');
await waitFor((v) => v.state.phase === 'review', 'review phase', 14_000);
const rv = latest.state.round;
assert(rv.doneWriting.length === 4, 'everyone done writing');
assert(Object.keys(rv.answers).length === 4, 'all answers visible in review');
assert(Array.isArray(rv.cells) && rv.cells.length === 6, 'graded cells present');
for (const b of bots) {
  for (let i = 0; i < 6; i++) {
    const a = rv.answers[b.id][i];
    assert(a === '' || a.toLowerCase().replace(/^(the|a|an)\s+/, '').startsWith(L.toLowerCase()), `bot ${b.name} answer "${a}" starts with ${L}`);
  }
}
console.log(
  'bot answers:',
  bots.map((b) => `${b.name}=[${rv.answers[b.id].map((a) => a || '-').join(', ')}]`).join('  '),
);
assert(rv.cells[5][hostId].status === 'blank', 'my blank is tagged blank');
const provisional = { ...rv.points };
assert(provisional[hostId] === 5, `my provisional points are 5 (got ${provisional[hostId]})`);

// ---- Flag a bot answer ----
let target = null;
for (let ci = 0; ci < 6 && !target; ci++) {
  for (const b of bots) {
    if (rv.answers[b.id][ci]) {
      target = { ci, bot: b };
      break;
    }
  }
}
assert(target, 'found a non-blank bot answer to flag');
await rejects(req(sock, 'letterrush:flag', { categoryIndex: 0, playerId: hostId }), 'flag own answer');
await req(sock, 'letterrush:flag', { categoryIndex: target.ci, playerId: target.bot.id });
await settle();
let cell = latest.state.round.cells[target.ci][target.bot.id];
assert(cell.flaggedBy.length === 1 && cell.flaggedBy[0] === hostId, 'my flag is recorded');
// 1 of 3 "others" is not a strict majority, so the answer keeps its status.
const before = rv.cells[target.ci][target.bot.id].status;
assert(cell.status === before, `single flag does not reject (status ${cell.status})`);
await req(sock, 'letterrush:flag', { categoryIndex: target.ci, playerId: target.bot.id }); // toggle off
await settle();
assert(latest.state.round.cells[target.ci][target.bot.id].flaggedBy.length === 0, 'flag toggled off');
await req(sock, 'letterrush:flag', { categoryIndex: target.ci, playerId: target.bot.id }); // back on
await settle();
console.log(`flagged ${target.bot.name}'s "${rv.answers[target.bot.id][target.ci]}" in category ${target.ci + 1}`);

// ---- Finish review (host) ----
const expected = { ...latest.state.round.points };
await req(sock, 'letterrush:finishReview');
await settle();
assert(latest.state.phase === 'scores', 'scores phase');
const sr = latest.state.round;
assert(JSON.stringify(sr.roundPoints) === JSON.stringify(expected), 'committed points equal the provisional grid');
for (const id of [hostId, ...bots.map((b) => b.id)]) {
  assert(latest.state.scores[id] === expected[id], `total for ${id} equals round points`);
  const okCount = sr.cells.filter((c) => c[id].status === 'ok').length;
  assert(okCount === expected[id], `points for ${id} match number of +1 cells`);
}
assert(latest.state.scores[hostId] === 5, 'host scored 5');
assert(latest.state.roundsPlayed === 1, 'one round played');
console.log('scores:', latest.players.map((p) => `${p.name}=${latest.state.scores[p.id]}`).join(', '));
await rejects(req(sock, 'letterrush:done'), 'done during scores');

// ---- Next -> ended (rounds = 1) ----
await req(sock, 'letterrush:next');
await settle();
assert(latest.state.phase === 'ended', 'game ended after the final round');
await rejects(req(sock, 'letterrush:settings', { rounds: 2, roundSeconds: 60 }), 'settings outside lobby');
await req(sock, 'letterrush:reset');
await settle();
assert(latest.state.phase === 'lobby', 'back in the lobby');
assert(Object.keys(latest.state.scores).length === 0, 'scores wiped');
assert(latest.state.settings.rounds === 1 && latest.state.settings.roundSeconds === 30, 'settings kept on reset');

console.log('\nLETTER RUSH E2E PASSED');
sock.disconnect();
process.exit(0);
