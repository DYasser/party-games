// End-to-end smoke test for Word Race: a human host plus two bots play one round.
// Run against your own server: PORT=3107 npx tsx server/src/index.ts, then E2E_URL=http://localhost:3107 node scripts/e2e-wordrace.mjs
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const hostId = 'wr-human-0001';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

async function waitFor(pred, label, timeoutMs, stepMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (latest && pred(latest)) return;
    await settle(stepMs);
  }
  throw new Error(`ASSERT: timed out waiting for ${label}`);
}

const MARK = /^[gyx]$/;
const isMarks = (m) => Array.isArray(m) && m.length === 5 && m.every((x) => MARK.test(x));

// ---- Lobby ----
const { code } = await req(sock, 'room:create', { game: 'wordrace', name: 'Human', playerId: hostId });
console.log('word race room', code);
await settle();
assert(latest.game === 'wordrace' && latest.state.phase === 'lobby', 'lobby');
assert(latest.state.settings.rounds === 3 && latest.state.settings.roundSeconds === 180, 'default settings');
assert(latest.state.settings.maxGuesses === 6, 'maxGuesses fixed at 6');

await rejects(req(sock, 'wordrace:settings', { rounds: 0 }), 'rounds too low');
await rejects(req(sock, 'wordrace:settings', { roundSeconds: 30 }), 'round too short');
await rejects(req(sock, 'wordrace:guess', { word: 'CRANE' }), 'guess in lobby');
await rejects(req(sock, 'wordrace:next'), 'next in lobby');
await req(sock, 'wordrace:settings', { rounds: 1, roundSeconds: 90 });
await req(sock, 'room:addBot');
await req(sock, 'room:addBot');
await settle();
assert(latest.state.settings.rounds === 1 && latest.state.settings.roundSeconds === 90, 'settings applied');
const botIds = latest.players.filter((p) => p.isBot).map((p) => p.id);
assert(botIds.length === 2, 'two bots seated');

// ---- Round 1 ----
await req(sock, 'wordrace:start');
await settle();
let s = latest.state;
assert(s.phase === 'playing' && s.round.number === 1, 'round 1 playing');
assert(Math.abs(s.round.endsAt - (s.serverNow + 90_000)) < 2000, 'clock set from settings');
assert(s.round.answer === null, 'answer hidden while playing');
assert(s.round.participantIds.length === 3, 'host + 2 bots in round');
assert(Object.keys(s.round.boards).length === 3, 'a board per participant');
await rejects(req(sock, 'wordrace:start'), 'start while playing');
await rejects(req(sock, 'wordrace:settings', { rounds: 2 }), 'settings while playing');

// Human guesses: shape + validation.
await rejects(req(sock, 'wordrace:guess', { word: 'ABC' }), 'too-short guess');
await rejects(req(sock, 'wordrace:guess', { word: 'CR4NE' }), 'non-letter guess');
await req(sock, 'wordrace:guess', { word: 'crane' });
await settle();
s = latest.state;
const mine = s.round.boards[hostId];
assert(mine.guesses.length === 1 && mine.guesses[0].word === 'CRANE', 'own guess shows letters (uppercased)');
assert(isMarks(mine.guesses[0].marks), 'feedback is five g/y/x marks');
console.log('human guessed CRANE ->', mine.guesses[0].marks.join(''));
await rejects(req(sock, 'wordrace:guess', { word: 'CRANE' }), 'repeat guess');

// Non-words are refused outright rather than costing a guess.
await rejects(req(sock, 'wordrace:guess', { word: 'ZZZZZ' }), 'non-word guess');

// Burn the remaining guesses with real words that are never in the answer pool.
const burn = ['FJORD', 'GLYPH', 'NYMPH', 'CRYPT', 'SYLPH'];
for (const w of burn) await req(sock, 'wordrace:guess', { word: w });
await settle();
s = latest.state;
if (s.phase === 'playing') {
  assert(s.round.boards[hostId].status === 'failed', 'human failed after 6 guesses');
  assert(s.round.boards[hostId].guesses.length === 6, 'six guesses recorded');
  await rejects(req(sock, 'wordrace:guess', { word: 'SLATE' }), 'guess after failing');
}

// Bots think 5-10s per guess; wait until at least one has a marked row, then check hiding.
await waitFor((v) => v.state.phase !== 'playing' || botIds.some((id) => v.state.round.boards[id].guesses.length > 0), 'a bot guess', 15_000);
s = latest.state;
if (s.phase === 'playing') {
  for (const id of botIds) {
    for (const g of s.round.boards[id].guesses) {
      assert(g.word === null, "other players' letters are hidden while playing");
      assert(isMarks(g.marks), "other players' marks are visible");
    }
  }
  console.log('bot boards while playing:', botIds.map((id) => `${s.round.boards[id].guesses.length} rows, letters hidden`).join(' | '));
}

// Round ends when both bots solve/fail (<= ~60s) or the 90s clock runs out.
await waitFor((v) => v.state.phase === 'reveal', 'reveal', 100_000, 500);
s = latest.state;
assert(typeof s.round.answer === 'string' && /^[A-Z]{5}$/.test(s.round.answer), 'answer revealed');
assert(s.round.revealEndsAt !== null, 'reveal countdown set');
assert(s.roundsPlayed === 1, 'one round played');
for (const id of [hostId, ...botIds]) {
  const b = s.round.boards[id];
  assert(b.status === 'solved' || b.status === 'failed', `${id} finished`);
  assert(b.guesses.every((g) => typeof g.word === 'string' && g.word.length === 5), 'letters revealed for everyone');
  if (b.status === 'solved') {
    const last = b.guesses[b.guesses.length - 1];
    assert(last.word === s.round.answer && last.marks.every((m) => m === 'g'), 'solved board ends on the answer');
    const expected = (7 - b.guesses.length) * 10 + ([15, 10, 5][b.finishOrder - 1] ?? 0);
    assert(b.points === expected, `points ${b.points} match formula ${expected}`);
    assert(s.scores[id] === b.points, 'score equals round points after round 1');
  } else {
    assert(b.points === 0, 'failed boards score 0');
  }
}
assert(s.round.boards[hostId].status === 'failed' && s.scores[hostId] === 0, 'human failed with 0');
console.log(
  'reveal: answer =', s.round.answer, '| reason =', s.round.endReason, '|',
  botIds.map((id) => `${latest.players.find((p) => p.id === id).name}: ${s.round.boards[id].status}${s.round.boards[id].finishOrder ? ' #' + s.round.boards[id].finishOrder : ''} (${s.round.boards[id].guesses.map((g) => g.word).join(',')}) +${s.round.boards[id].points}`).join(' | '),
);
await rejects(req(sock, 'wordrace:guess', { word: 'SLATE' }), 'guess during reveal');

// Host skips the reveal -> last round, so the game ends.
await req(sock, 'wordrace:next');
await settle();
s = latest.state;
assert(s.phase === 'ended', 'ended after last round');
assert(s.round.answer && Object.keys(s.scores).length === 3, 'leaderboard has everyone');
await rejects(req(sock, 'wordrace:next'), 'next when ended');
console.log('ended: scores', s.scores);

// Play again resets scores and deals round 1 again with a fresh word list.
await req(sock, 'wordrace:start');
await settle();
s = latest.state;
assert(s.phase === 'playing' && s.round.number === 1, 'play again starts round 1');
assert(Object.values(s.scores).every((v) => v === 0), 'scores wiped on play again');

// Reset back to lobby.
await req(sock, 'wordrace:reset');
await settle();
assert(latest.state.phase === 'lobby' && Object.keys(latest.state.scores).length === 0, 'reset to lobby');
assert(latest.state.settings.rounds === 1, 'settings kept across reset');

console.log('\nWORD RACE E2E PASSED');
sock.disconnect();
process.exit(0);
