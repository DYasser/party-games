// End-to-end smoke test for bots: a single human fills both games with bots and watches them play.
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const hostId = 'human-host-0001';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

// ---- Cipher Grid ----
const { code } = await req(sock, 'room:create', { game: 'ciphergrid', name: 'Human', playerId: hostId });
console.log('cipher grid room', code);
for (let i = 0; i < 3; i++) await req(sock, 'room:addBot');
await settle();
const bots = latest.players.filter((p) => p.isBot);
assert(bots.length === 3, 'three bots seated');
assert(bots.every((b) => b.team && b.role), 'bots picked team + role');
assert(bots.filter((b) => b.role === 'spymaster').length === 2, 'bots filled both spymaster seats');
console.log('bots:', bots.map((b) => `${b.name}=${b.team}/${b.role}`).join(', '));

// Human takes over a bot's spymaster seat; bot gets bumped to operative.
const redSpyBot = bots.find((b) => b.team === 'red' && b.role === 'spymaster');
await req(sock, 'team:join', { team: 'red', role: 'spymaster' });
await settle();
assert(latest.players.find((p) => p.id === redSpyBot.id).role === 'operative', 'bot bumped to operative');
// Red now has human spy + 2 bot operatives and blue has no operative; Start should rebalance the bots.
await req(sock, 'game:start');
await settle();
assert(latest.state.phase === 'playing', 'game started with bots');
const blueOps = latest.players.filter((p) => p.team === 'blue' && p.role === 'operative');
assert(blueOps.length === 1 && blueOps[0].isBot, 'a bot moved to fill blue operative');
console.log('after rebalance:', latest.players.map((p) => `${p.name}=${p.team}/${p.role}`).join(', '));

// Blue is all bots: they should clue + guess on their own. Red has a human spymaster: bots wait for the human.
const turn = latest.state.turn;
console.log('starting team', turn, '- waiting for bots to act...');
await settle(9000);
const log = latest.state.log;
if (turn === 'blue') {
  assert(log.some((e) => e.kind === 'clue' && e.team === 'blue'), 'blue bot spymaster gave a clue');
  assert(log.some((e) => e.kind === 'guess' || e.kind === 'endTurn'), 'blue bot operative acted');
} else {
  assert(log.length === 0, 'bots waited for the human red spymaster');
  await req(sock, 'game:clue', { word: 'nebula', count: 2 });
  await settle(6000);
  assert(latest.state.log.some((e) => e.kind === 'guess' && e.team === 'red'), 'red bot operative guessed after human clue');
}
console.log('cipher grid log:', latest.state.log.map((e) => `${e.by ?? e.team}:${e.kind}${e.word ? ':' + e.word : ''}`).join(' | '));

await req(sock, 'game:reset');
await req(sock, 'room:removeBots');
await settle(150);
assert(latest.players.length === 1, 'bots removed');
console.log('bots removed\n');

// ---- Infiltrator ----
sock.emit('room:leave');
await settle();
const { code: code2 } = await req(sock, 'room:create', { game: 'infiltrator', name: 'Human', playerId: hostId });
console.log('infiltrator room', code2);
await rejects(req(sock, 'infiltrator:start'), 'start alone');
await req(sock, 'room:addBot');
await req(sock, 'room:addBot');
await req(sock, 'room:addBot');
await req(sock, 'infiltrator:settings', { roundSeconds: 120 });
await req(sock, 'infiltrator:start');
await settle();
assert(latest.state.phase === 'playing', 'round started with bots');
const round = latest.state.round;
const botIds = latest.players.filter((p) => p.isBot).map((p) => p.id);
console.log('human is spy?', round.isSpy);

// Human accuses a bot; the other bots should vote within a few seconds.
await req(sock, 'infiltrator:accuse', { accusedId: botIds[0] });
await settle(7000);
const s = latest.state;
assert(!s.round.accusation || s.phase === 'ended', 'bots resolved the accusation');
console.log('after accusation: phase =', s.phase, s.round.result ? `result=${s.round.result.winner}/${s.round.result.reason}` : '(clock resumed)');

console.log('\nBOTS E2E PASSED');
sock.disconnect();
process.exit(0);
