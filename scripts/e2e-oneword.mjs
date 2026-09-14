// End-to-end smoke test for One Word: one human host plus three bots play through three cards.
// Run against your own server: PORT=3102 npx tsx server/src/index.ts, then E2E_URL=http://localhost:3102 node scripts/e2e-oneword.mjs
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const hostId = 'oneword-host-0001';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

/** Poll the latest view until `pred` holds. */
async function waitFor(label, pred, timeoutMs = 40_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (latest && pred(latest)) return latest;
    await settle(100);
  }
  throw new Error(`TIMEOUT waiting for ${label} (phase=${latest?.state.phase})`);
}
const nameOf = (id) => latest.players.find((p) => p.id === id)?.name ?? id;

const { code } = await req(sock, 'room:create', { game: 'oneword', name: 'Human', playerId: hostId });
console.log('one word room', code);
await settle();
assert(latest.game === 'oneword' && latest.state.phase === 'lobby', 'lobby');
await rejects(req(sock, 'oneword:start'), 'start alone');
for (let i = 0; i < 3; i++) await req(sock, 'room:addBot');
await settle();
assert(latest.players.filter((p) => p.isBot).length === 3, 'three bots seated');
await rejects(req(sock, 'oneword:hint', { text: 'early' }), 'hint before start');

// ---- Card 1: the human is the guesser (seat 0). Bots write hints, review, then the human guesses wrong. ----
await req(sock, 'oneword:start');
await settle();
let s = latest.state;
assert(s.phase === 'hinting', 'card 1 hinting');
assert(s.deckSize === 13 && s.outcomes.length === 13 && s.outcomes.every((o) => o === null), 'fresh 13-card deck');
assert(s.card.guesserId === hostId, 'host guesses first');
assert(s.card.word === null && s.card.hints === null, 'guesser sees neither word nor hints');
assert(s.phaseEndsAt - s.serverNow > 40_000, 'hint clock ~45s');
await rejects(req(sock, 'oneword:hint', { text: 'nope' }), 'guesser hinting');
await rejects(req(sock, 'oneword:guess', { text: 'early' }), 'guessing before hints');
await rejects(req(sock, 'oneword:start'), 'start mid-game');

await waitFor('bots to hint + review', (v) => v.state.phase === 'guessing');
s = latest.state;
assert(s.card.word === null, 'word still hidden while guessing');
assert(Array.isArray(s.card.hints) && s.card.hints.length >= 1 && s.card.hints.length <= 3, 'guesser sees surviving hints');
assert(s.card.hints.every((h) => !h.cancelled), 'no cancelled hints reach the guesser');
console.log('card 1 hints for human:', s.card.hints.map((h) => `${nameOf(h.playerId)}:${h.text}`).join(', '));
await rejects(req(sock, 'oneword:ready'), 'guesser pressing ready');
await req(sock, 'oneword:guess', { text: 'definitelywrongxyz' });
await settle();
s = latest.state;
assert(s.phase === 'result' && s.card.outcome === 'fail', 'wrong guess -> fail');
assert(typeof s.card.word === 'string' && s.card.word.length > 0, 'word revealed on result');
assert(s.outcomes[0] === 'fail' && s.outcomes[1] === 'discarded' && s.outcomes[2] === null, 'wrong guess burns the next card');
assert(s.score === 0, 'no point');
assert(s.card.hints.length === 3, 'result shows every hint');
console.log(`card 1: word was "${s.card.word}", human guessed wrong -> card 2 discarded`);

// Host skips the result countdown.
await req(sock, 'oneword:next');
await settle();
s = latest.state;
assert(s.phase === 'hinting' && s.card.index === 2, 'moved to card 3 (index 2)');
assert(s.card.guesserId !== hostId && latest.players.find((p) => p.id === s.card.guesserId).isBot, 'a bot guesses next');

// ---- Card 2 (deck index 2): the human is a hinter. ----
const secret = s.card.word;
assert(typeof secret === 'string' && secret.length > 0, 'hinter sees the secret word');
console.log(`card 2: ${nameOf(s.card.guesserId)} guesses, secret is "${secret}"`);
await rejects(req(sock, 'oneword:hint', { text: secret }), 'hint = secret word');
await rejects(req(sock, 'oneword:hint', { text: secret.toUpperCase() + 's' }), 'hint containing secret');
await rejects(req(sock, 'oneword:hint', { text: 'two words' }), 'two-word hint');
await rejects(req(sock, 'oneword:hint', { text: 'h1nt' }), 'hint with digits');
await rejects(req(sock, 'oneword:guess', { text: secret }), 'hinter guessing');
await rejects(req(sock, 'oneword:next'), 'next outside result');
await req(sock, 'oneword:hint', { text: 'quokka' });
await settle();
assert(latest.state.card.yourHint === 'quokka' && latest.state.card.submittedIds.includes(hostId), 'own hint echoed back');
if (latest.state.phase === 'hinting') {
  await req(sock, 'oneword:hint', { text: 'zephyr' });
  await settle();
  assert(latest.state.card.yourHint === 'zephyr', 'hint can be changed while hinting is open');
}

await waitFor('all hints in', (v) => v.state.phase !== 'hinting');
s = latest.state;
assert(s.phase === 'review', 'review phase');
assert(s.card.hints.length === 3, 'hinters see every hint in review');
console.log('card 2 hints:', s.card.hints.map((h) => `${nameOf(h.playerId)}:${h.text}${h.duplicate ? ' (dup)' : ''}`).join(', '));
const botHint = s.card.hints.find((h) => h.playerId !== hostId && !h.duplicate);
if (botHint) {
  await req(sock, 'oneword:cancel', { playerId: botHint.playerId });
  await settle();
  assert(latest.state.card.hints.find((h) => h.playerId === botHint.playerId).cancelled === true, 'toggle cancel on');
  await req(sock, 'oneword:cancel', { playerId: botHint.playerId });
  await settle();
  assert(latest.state.card.hints.find((h) => h.playerId === botHint.playerId).cancelled === false, 'toggle cancel off');
}
await rejects(req(sock, 'oneword:cancel', { playerId: 'nobody-here' }), 'cancel unknown hint');
if (latest.state.phase === 'review') {
  await req(sock, 'oneword:ready');
  await settle();
  assert(latest.state.phase === 'guessing' || latest.state.card.ready.includes(hostId), 'host ready recorded');
}
await waitFor('bots ready', (v) => v.state.phase === 'guessing' || v.state.phase === 'result', 15_000);
await rejects(req(sock, 'oneword:pass'), 'hinter passing');
await waitFor('bot guess', (v) => v.state.phase === 'result', 15_000);
s = latest.state;
assert(['success', 'fail'].includes(s.card.outcome), 'bot guessed');
assert(typeof s.card.guess === 'string', 'bot guess recorded');
console.log(`card 2: ${nameOf(s.card.guesserId)} guessed "${s.card.guess}" -> ${s.card.outcome} (score ${s.score})`);
const scoreAfter2 = s.score;
const indexAfter2 = s.card.index;

// ---- Card 3: auto-advance after the result timer, another bot guesses. ----
await waitFor('auto-advance', (v) => v.state.phase === 'hinting' && v.state.card.index > indexAfter2, 12_000);
s = latest.state;
assert(latest.players.find((p) => p.id === s.card.guesserId).isBot && s.card.guesserId !== hostId, 'third guesser is a bot');
assert(s.card.hinterIds.includes(hostId), 'human hints again');
console.log(`card 3: ${nameOf(s.card.guesserId)} guesses, secret is "${s.card.word}"`);
await req(sock, 'oneword:hint', { text: 'marmalade' });
await waitFor('review', (v) => v.state.phase !== 'hinting');
await req(sock, 'oneword:ready');
await waitFor('bot guess', (v) => v.state.phase === 'result', 20_000);
s = latest.state;
console.log(`card 3: ${nameOf(s.card.guesserId)} guessed "${s.card.guess}" -> ${s.card.outcome} (score ${s.score})`);
assert(s.score === scoreAfter2 + (s.card.outcome === 'success' ? 1 : 0), 'score tracks successes');
const done = s.outcomes.filter((o) => o !== null).length;
assert(done >= 4 && done <= 7, `deck progressed (${done} cards resolved)`);
console.log('deck:', s.outcomes.map((o) => (o === null ? '·' : o[0])).join(''));

// ---- Reset back to the lobby. ----
await req(sock, 'oneword:reset');
await settle();
assert(latest.state.phase === 'lobby' && latest.state.card === null && latest.state.score === 0, 'reset to lobby');

console.log('\nONE WORD E2E PASSED');
sock.disconnect();
process.exit(0);
