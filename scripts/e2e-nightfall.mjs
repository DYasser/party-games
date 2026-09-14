// End-to-end smoke test for Nightfall: one human host + 5 bots play through a night and a day.
// Run against your own server: PORT=3103 npx tsx server/src/index.ts, then E2E_URL=http://localhost:3103 node scripts/e2e-nightfall.mjs
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const hostId = 'nf-human-host-01';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

/** Wait until `pred(latest)` holds or `ms` elapses. */
async function waitFor(pred, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (latest && pred(latest)) return;
    await settle(150);
  }
  throw new Error(`ASSERT: timed out waiting for ${label}`);
}

const { code } = await req(sock, 'room:create', { game: 'nightfall', name: 'Human', playerId: hostId });
console.log('nightfall room', code);
await settle();
assert(latest.game === 'nightfall' && latest.state.phase === 'lobby', 'lobby');

await rejects(req(sock, 'nightfall:start'), 'start alone');
await rejects(req(sock, 'nightfall:settings', { daySeconds: 10 }), 'too-short day');
await req(sock, 'nightfall:settings', { daySeconds: 60 });
await rejects(req(sock, 'infiltrator:start'), 'infiltrator event in nightfall room');

for (let i = 0; i < 5; i++) await req(sock, 'room:addBot');
await settle();
assert(latest.players.length === 6 && latest.players.filter((p) => p.isBot).length === 5, 'five bots seated');
assert(latest.state.settings.daySeconds === 60, 'day length stored');

// ---- Start: night 1 ----
await req(sock, 'nightfall:start');
await settle();
let s = latest.state;
assert(s.phase === 'night' && s.dayNumber === 1, 'night 1 began');
assert(s.participantIds.length === 6, 'six participants');
assert(s.you.participant && s.you.role, 'human was dealt a role');
assert(Math.abs(s.night.endsAt - (s.serverNow + 60_000)) < 2000, 'night clock is 60s');
assert(s.log.length === 1 && s.log[0].kind === 'start', 'start logged');
const revealedAtStart = Object.keys(s.revealedRoles);
if (s.you.role === 'shade') assert(revealedAtStart.every((id) => s.revealedRoles[id] === 'shade'), 'shade sees only shades');
else assert(revealedAtStart.length === 1 && revealedAtStart[0] === hostId, 'town sees only their own role');
console.log('human role:', s.you.role, '| has night action:', s.you.hasNightAction);

if (s.you.hasNightAction) {
  // Roles wake in order now, so wait until this role is the one awake.
  await waitFor((v) => v.state.phase !== 'night' || v.state.you.yourTurn, 70_000, 'the human turn');
  s = latest.state;
  if (s.phase !== 'night') {
    console.log('night ended before the human turn came round');
  } else {
  const target = s.you.eligibleTargets[0];
  const other = s.you.eligibleTargets[1];
  assert(target, 'has eligible targets');
  await rejects(req(sock, 'nightfall:vote', { targetId: target }), 'voting at night');

  // Ready needs a pick first.
  await rejects(req(sock, 'nightfall:nightReady'), 'ready with no pick');

  // A pick is provisional: it must not end the night, and it can be changed.
  await req(sock, 'nightfall:nightAction', { targetId: target });
  await settle();
  assert(latest.state.phase === 'night', 'a bare pick does not resolve the night');
  assert(latest.state.you.nightPick === target, 'night pick recorded');
  assert(latest.state.you.nightReady === false, 'not ready yet');
  if (other) {
    await req(sock, 'nightfall:nightAction', { targetId: other });
    await settle();
    assert(latest.state.you.nightPick === other, 'provisional pick can be changed');
    await req(sock, 'nightfall:nightAction', { targetId: target });
    await settle();
  }
  console.log('provisional pick works, changeable before Ready');

  // Ready locks it in.
  await req(sock, 'nightfall:nightReady');
  await settle();
  if (latest.state.phase === 'night') {
    assert(latest.state.you.nightReady === true, 'ready recorded');
    await rejects(req(sock, 'nightfall:nightAction', { targetId: target }), 'changing a locked pick');
    await rejects(req(sock, 'nightfall:nightReady'), 'readying twice');
  }
  console.log('human locked in ->', latest.players.find((p) => p.id === target)?.name);
  }
} else {
  await rejects(req(sock, 'nightfall:nightAction', { targetId: s.participantIds[1] }), 'townsfolk night action');
  await rejects(req(sock, 'nightfall:nightReady'), 'townsfolk ready');
}

// Bots act in 3-8s; night resolves when all have acted (or after 60s).
await waitFor((v) => v.state.phase !== 'night', 70_000, 'night 1 to resolve');
s = latest.state;
console.log('after night 1: phase =', s.phase, '| lastNight =', JSON.stringify(s.lastNight));
assert(s.lastNight && s.lastNight.number === 1, 'night outcome recorded');
assert(s.log.some((e) => e.kind === 'night' && e.night === 1), 'night result logged');
if (s.lastNight.killedId) {
  assert(s.alive[s.lastNight.killedId] === false, 'victim marked dead');
  assert(s.revealedRoles[s.lastNight.killedId], 'dead player role revealed to everyone');
}
if (s.you.role === 'oracle') {
  assert(s.you.oracleResults.length === 1, 'oracle got a result');
  assert(s.log.some((e) => e.kind === 'oracle'), 'oracle private log entry visible to oracle');
} else if (s.you.alive) {
  assert(!s.log.some((e) => e.kind === 'oracle'), 'oracle result hidden from others');
}

if (s.phase === 'day') {
  // ---- Day 1 ----
  assert(s.day && s.day.number === 1, 'day 1');
  assert(Math.abs(s.day.endsAt - (s.serverNow + 60_000)) < 2000, 'day clock from settings');
  await rejects(req(sock, 'nightfall:nightAction', { targetId: s.participantIds[1] }), 'night action by day');

  if (s.you.alive) {
    const living = s.participantIds.filter((id) => s.alive[id] && id !== hostId);
    // The day opens locked for discussion; an early vote is refused.
    await rejects(req(sock, 'nightfall:vote', { targetId: living[0] }), 'vote during the discussion lock');
    await waitFor((v) => v.state.phase !== 'day' || v.state.serverNow >= v.state.day.votesOpenAt, 20_000, 'voting to open');
    console.log('voting opened after the discussion lock');
    await rejects(req(sock, 'nightfall:vote', { targetId: hostId }), 'self vote');
    await req(sock, 'nightfall:vote', { targetId: living[0] });
    await settle();
    if (latest.state.phase === 'day') {
      assert(latest.state.day.votes[hostId] === living[0], 'vote is public');
      await req(sock, 'nightfall:vote', { targetId: null });
      await settle();
      if (latest.state.phase === 'day') assert(latest.state.day.votes[hostId] === null, 'changed to skip');
    }
    console.log('human voted, then switched to skip');
  } else {
    await rejects(req(sock, 'nightfall:vote', { targetId: null }), 'dead voting');
    console.log('human is dead; spectating with', Object.keys(s.revealedRoles).length, 'roles visible');
    assert(Object.keys(s.revealedRoles).length === 6, 'dead see every role');
  }

  // Bots vote within ~8-20s; otherwise the 60s day timer resolves it. Either way the day must end.
  const logBefore = latest.state.log.length;
  await waitFor((v) => v.state.phase !== 'day' || (v.state.day && v.state.day.number !== 1), 75_000, 'day 1 to resolve');
  s = latest.state;
  assert(s.log.length > logBefore, 'log grew after day');
  const banish = s.log.find((e) => e.kind === 'banish' && e.day === 1);
  assert(banish, 'banishment logged');
  console.log('day 1 result:', banish.reason, banish.banishedId ? `banished ${latest.players.find((p) => p.id === banish.banishedId)?.name} (${banish.role})` : 'nobody banished');
  assert(s.phase === 'night' || s.phase === 'ended', 'moved on to night 2 or ended');
  if (s.phase === 'night') {
    assert(s.dayNumber === 2, 'night 2');
    // Host can call the vote only by day.
    await rejects(req(sock, 'nightfall:callVote'), 'call vote at night');
    // Let night 2 resolve and then call the vote as host if we reach day 2.
    await waitFor((v) => v.state.phase !== 'night', 70_000, 'night 2 to resolve');
    if (latest.state.phase === 'day') {
      await req(sock, 'nightfall:callVote');
      await settle();
      assert(latest.state.log.some((e) => e.kind === 'banish' && e.day === 2), 'host called the vote on day 2');
      console.log('host called the vote on day 2 -> phase', latest.state.phase);
    }
  }
} else {
  assert(s.phase === 'ended', 'ended right after night 1');
}

s = latest.state;
if (s.phase === 'ended') {
  assert(s.winner === 'shades' || s.winner === 'town', 'winner set');
  assert(Object.keys(s.revealedRoles).length === 6, 'all roles revealed at the end');
  assert(s.log.at(-1).kind === 'win', 'win logged');
  console.log('game ended, winner:', s.winner);
}

// ---- Reset ----
await req(sock, 'nightfall:reset');
await settle();
assert(latest.state.phase === 'lobby' && latest.state.participantIds.length === 0, 'reset to lobby');
assert(latest.state.settings.daySeconds === 60, 'settings survive reset');
console.log('chronicle:', s.log.map((e) => e.kind).join(' > '));

console.log('\nNIGHTFALL E2E PASSED');
sock.disconnect();
process.exit(0);
