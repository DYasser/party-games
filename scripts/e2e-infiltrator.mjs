// End-to-end smoke test for Infiltrator. Requires the server running on :3001 (npm run dev:server).
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const ids = ['spy-aaaaaaaa', 'spy-bbbbbbbb', 'spy-cccccccc', 'spy-dddddddd'];
const names = ['Ann', 'Bob', 'Cid', 'Dee'];

const socks = await Promise.all(ids.map(() => connect()));
const [host] = socks;
const latest = socks.map(() => null);
socks.forEach((s, i) => s.on('room:state', (v) => (latest[i] = v)));
const byId = (id) => socks[ids.indexOf(id)];
const viewOf = (id) => latest[ids.indexOf(id)];

const { code } = await req(host, 'room:create', { game: 'infiltrator', name: names[0], playerId: ids[0] });
console.log('room created', code);
await req(socks[1], 'room:join', { code, name: names[1], playerId: ids[1] });
await settle();
assert(latest[0].game === 'infiltrator', 'room is infiltrator');

await rejects(req(host, 'infiltrator:start'), 'start with 2 players');
await req(socks[2], 'room:join', { code, name: names[2], playerId: ids[2] });
await req(socks[3], 'room:join', { code, name: names[3], playerId: ids[3] });
await rejects(req(socks[1], 'infiltrator:start'), 'non-host start');
await rejects(req(host, 'infiltrator:settings', { roundSeconds: 5 }), 'too-short round');
await req(host, 'infiltrator:settings', { roundSeconds: 300 });
await rejects(req(host, 'game:start'), 'ciphergrid event in infiltrator room');

// ---- Round 1: accusation flow + wrong spy guess ----
await req(host, 'infiltrator:start');
await settle();
const v0 = latest[0].state;
assert(v0.phase === 'playing' && v0.round.number === 1, 'round 1 playing');
assert(Math.abs(v0.round.endsAt - (v0.serverNow + 300_000)) < 2000, 'clock set from settings');
const spyId = ids.find((id) => viewOf(id).state.round.isSpy);
const agents = ids.filter((id) => id !== spyId);
assert(spyId && agents.length === 3, 'exactly one spy');
assert(viewOf(spyId).state.round.location === null, 'spy does not see location');
assert(viewOf(spyId).state.round.spyId === null, 'spy identity hidden');
assert(agents.every((id) => viewOf(id).state.round.location && viewOf(id).state.round.role), 'agents see location + role');
console.log('round 1: spy is', names[ids.indexOf(spyId)], '| location hidden from spy, shown to agents');

// Accuse an innocent; one dissenting vote cancels and resumes the clock.
await rejects(req(byId(agents[0]), 'infiltrator:accuse', { accusedId: agents[0] }), 'self accusation');
await req(byId(agents[0]), 'infiltrator:accuse', { accusedId: agents[1] });
await settle();
assert(latest[0].state.round.accusation?.accusedId === agents[1], 'accusation visible');
assert(latest[0].state.round.pausedAt !== null, 'clock paused');
await rejects(req(byId(agents[1]), 'infiltrator:vote', { agree: true }), 'accused voting');
await req(byId(agents[2]), 'infiltrator:vote', { agree: false });
await settle();
assert(latest[0].state.round.accusation === null && latest[0].state.round.pausedAt === null, 'accusation cancelled, clock resumed');
await rejects(req(byId(agents[0]), 'infiltrator:accuse', { accusedId: spyId }), 'second accusation by same player');
console.log('accusation cancelled by dissent');

// Spy guesses wrong -> agents win.
await rejects(req(byId(agents[0]), 'infiltrator:guess', { location: 'Zoo' }), 'non-spy guessing');
const realLocation = viewOf(agents[0]).state.round.location;
const wrong = viewOf(spyId).state.locations.find((l) => l !== realLocation);
await req(byId(spyId), 'infiltrator:guess', { location: wrong });
await settle();
let s = latest[0].state;
assert(s.phase === 'ended', 'round ended');
assert(s.round.result.winner === 'agents' && s.round.result.reason === 'spyGuessedWrong', 'agents win by wrong guess');
assert(s.round.spyId === spyId && s.round.location === realLocation, 'reveal shows spy + location');
assert(viewOf(spyId).state.round.location === realLocation, 'spy sees location after end');
assert(agents.every((id) => s.scores[id] === 1) && s.scores[spyId] === 0, 'agents scored 1 each');
console.log('round 1 over: agents win, scores', s.scores);

// ---- Round 2: unanimous accusation catches the spy ----
await req(host, 'infiltrator:start');
await settle();
s = latest[0].state;
assert(s.phase === 'playing' && s.round.number === 2, 'round 2 playing');
const spy2 = ids.find((id) => viewOf(id).state.round.isSpy);
const agents2 = ids.filter((id) => id !== spy2);
await req(byId(agents2[0]), 'infiltrator:accuse', { accusedId: spy2 });
await req(byId(agents2[1]), 'infiltrator:vote', { agree: true });
await settle();
assert(latest[0].state.phase === 'playing', 'not yet unanimous');
await req(byId(agents2[2]), 'infiltrator:vote', { agree: true });
await settle();
s = latest[0].state;
assert(s.phase === 'ended' && s.round.result.reason === 'caught', 'spy caught');
const before = latest[0].state.scores;
assert(before[agents2[0]] >= 2, 'accuser got bonus point');
console.log('round 2 over: spy caught, scores', before);

// ---- Spy leaving mid-round hands the round to the agents ----
await req(host, 'infiltrator:start');
await settle();
const spy3 = ids.find((id) => viewOf(id).state.round.isSpy);
byId(spy3).emit('room:leave');
await settle(150);
const remainingView = latest.find((v, i) => ids[i] !== spy3 && v);
assert(remainingView.state.phase === 'ended' && remainingView.state.round.result.reason === 'spyLeft', 'spy leaving ends round');
assert(remainingView.players.length === 3, 'spy removed from room');
console.log('round 3: spy left, agents win by default');

// Reset clears scores
const newHost = ids.indexOf(remainingView.hostId);
const nonHost = ids.findIndex((id, i) => i !== newHost && id !== spy3);
await rejects(req(socks[nonHost], 'infiltrator:reset'), 'non-host reset');
await req(socks[newHost], 'infiltrator:reset');
await settle();
assert(latest[newHost].state.phase === 'lobby' && Object.keys(latest[newHost].state.scores).length === 0, 'reset to lobby');

console.log('\nINFILTRATOR E2E PASSED');
socks.forEach((sock) => sock.disconnect());
process.exit(0);
