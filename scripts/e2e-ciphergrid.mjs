// End-to-end smoke test for CipherGrid. Requires the server running on :3001 (npm run dev:server).
import { io } from 'socket.io-client';
import { assert, connect, playerId, req, settle } from './e2e-lib.mjs';

// Unique per run, so back-to-back runs against one server never collide.
const ids = ['ann', 'bob', 'cid', 'dee'].map((n) => playerId(`cg-${n}`));
const names = ['Ann', 'Bob', 'Cid', 'Dee'];

const socks = await Promise.all(ids.map(() => connect()));
const [a, b, c, d] = socks;
const latest = socks.map(() => null);
socks.forEach((s, i) => s.on('room:state', (v) => (latest[i] = v)));

const { code } = await req(a, 'room:create', { game: 'ciphergrid', name: names[0], playerId: ids[0] });
console.log('room created', code);
for (let i = 1; i < 4; i++) await req(socks[i], 'room:join', { code, name: names[i], playerId: ids[i] });

await req(a, 'room:join', { code: 'ZZZZ', name: 'x', playerId: ids[0] }).then(
  () => assert(false, 'bad code should fail'),
  (e) => console.log('bad code rejected:', e.message),
);

await req(a, 'team:join', { team: 'red', role: 'spymaster' });
await req(b, 'team:join', { team: 'red', role: 'operative' });
await req(c, 'team:join', { team: 'blue', role: 'spymaster' });
await req(d, 'team:join', { team: 'blue', role: 'spymaster' }).then(
  () => assert(false, 'duplicate spymaster should fail'),
  (e) => console.log('dup spymaster rejected:', e.message),
);
await req(d, 'team:join', { team: 'blue', role: 'operative' });

await req(b, 'game:start').then(() => assert(false, 'non-host start'), (e) => console.log('non-host start rejected:', e.message));
// Infiltrator events must be refused in a ciphergrid room
await req(a, 'infiltrator:start').then(() => assert(false, 'wrong game'), (e) => console.log('wrong-game event rejected:', e.message));
await req(a, 'game:start');
await settle();

const view = latest[0];
assert(view.state.phase === 'playing', 'phase playing');
assert(view.state.cards.length === 25, '25 cards');
assert(latest[0].state.cards.every((k) => k.type), 'spymaster sees key');
assert(latest[1].state.cards.every((k) => !k.type), 'operative sees no key');
console.log('starting team:', view.state.turn, 'remaining', view.state.remaining);

const turn = view.state.turn;
const [spy, op, otherOp] = turn === 'red' ? [a, b, d] : [c, d, b];
const spyIdx = socks.indexOf(spy);

await req(otherOp, 'game:guess', { index: 0 }).then(() => assert(false, 'wrong team guess'), (e) => console.log('wrong-team guess rejected:', e.message));
await req(op, 'game:guess', { index: 0 }).then(() => assert(false, 'guess before clue'), (e) => console.log('guess-before-clue rejected:', e.message));

await req(spy, 'game:clue', { word: 'zebra', count: 2 });
await settle();
assert(latest[1].state.currentClue?.word === 'ZEBRA', 'clue visible');

const ownIdx = latest[spyIdx].state.cards.findIndex((k) => k.type === turn && !k.revealed);
await req(op, 'game:guess', { index: ownIdx });
await settle();
assert(latest[1].state.cards[ownIdx].revealed && latest[1].state.cards[ownIdx].type === turn, 'correct guess revealed to everyone');
assert(latest[0].state.turn === turn, 'still same turn after correct guess');

await req(op, 'game:endTurn');
await settle();
assert(latest[0].state.turn !== turn, 'turn switched');
console.log('turn switched to', latest[0].state.turn);

b.disconnect();
await settle(150);
assert(latest[0].players.find((p) => p.id === ids[1]).connected === false, 'b marked disconnected');
const b2 = await connect();
await req(b2, 'room:join', { code, name: names[1], playerId: ids[1] });
await settle();
const bSeat = latest[0].players.find((p) => p.id === ids[1]);
assert(bSeat.connected && bSeat.team && bSeat.role === 'operative', 'b reconnected to same seat');
console.log('reconnect ok');

console.log('\nCIPHERGRID E2E PASSED');
[...socks, b2].forEach((s) => s.disconnect());
process.exit(0);
