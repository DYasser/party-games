// End-to-end smoke test for Bluff Dice: one human host plus two bots play until the
// game ends or three rounds have been resolved (set E2E_FULL=1 to always play to the end).
// Run against your own server:
//   PORT=3106 npx tsx server/src/index.ts
//   E2E_URL=http://localhost:3106 node scripts/e2e-bluffdice.mjs
import { assert, connect, rejects, req, settle } from './e2e-lib.mjs';

const hostId = 'dice-host-00001';
const sock = await connect();
let latest = null;
sock.on('room:state', (v) => (latest = v));

const { code } = await req(sock, 'room:create', { game: 'bluffdice', name: 'Human', playerId: hostId });
console.log('bluff dice room', code);

await rejects(req(sock, 'bluffdice:start'), 'start alone');
await rejects(req(sock, 'bluffdice:settings', { dicePerPlayer: 9, onesWild: true }), 'bad dice count');
await req(sock, 'bluffdice:settings', { dicePerPlayer: 3, onesWild: true });
await req(sock, 'room:addBot');
await req(sock, 'room:addBot');
await settle();
assert(latest.players.filter((p) => p.isBot).length === 2, 'two bots seated');
assert(latest.state.settings.dicePerPlayer === 3, 'settings applied');

await req(sock, 'bluffdice:start');
await settle();
assert(latest.state.phase === 'bidding', 'game started');
assert(latest.state.totalDice === 9, 'nine dice in play');
assert(latest.state.players[hostId].dice.length === 3, 'human sees own dice');
for (const p of latest.players.filter((p) => p.isBot)) {
  assert(latest.state.players[p.id].dice === null, 'bot dice hidden from human');
}
console.log('my dice:', latest.state.players[hostId].dice.join(' '), '| starter:', nameOf(latest.state.currentPlayerId));

// Illegal moves are rejected.
await rejects(req(sock, 'bluffdice:challenge'), 'challenge with no bid');
if (latest.state.currentPlayerId !== hostId) {
  await rejects(req(sock, 'bluffdice:bid', { quantity: 1, face: 2 }), 'bid out of turn');
} else {
  await rejects(req(sock, 'bluffdice:bid', { quantity: 1, face: 1 }), 'bid on wild ones');
  await rejects(req(sock, 'bluffdice:bid', { quantity: 10, face: 2 }), 'bid above dice in play');
}

const minFace = latest.state.settings.onesWild ? 2 : 1;
function nameOf(id) {
  return latest.players.find((p) => p.id === id)?.name ?? id;
}
function minimumRaise(bid, total) {
  if (!bid) return { quantity: 1, face: minFace };
  if (bid.face < 6) return { quantity: bid.quantity, face: bid.face + 1 };
  if (bid.quantity < total) return { quantity: bid.quantity + 1, face: minFace };
  return null;
}
function countMatching(dice, face) {
  return dice.filter((d) => d === face || (latest.state.settings.onesWild && d === 1)).length;
}

let bids = 0;
let challenges = 0;
let roundsResolved = 0;
let revealsSeen = new Set();
let lastRevealHandled = null;
const full = !!process.env.E2E_FULL;
const deadline = Date.now() + (full ? 400_000 : 150_000);

while (Date.now() < deadline) {
  const s = latest.state;
  if (s.phase === 'ended') break;

  if (s.phase === 'reveal') {
    const key = `${s.round}`;
    if (!revealsSeen.has(key)) {
      revealsSeen.add(key);
      roundsResolved++;
      const r = s.lastResult;
      // Everyone's dice are visible during the reveal.
      for (const id of s.seatOrder) assert(Array.isArray(s.players[id].dice), 'all dice revealed');
      const actual = s.seatOrder.reduce((n, id) => n + countMatching(s.players[id].dice, r.bid.face), 0);
      assert(actual === r.actual, `reveal count matches (${actual} vs ${r.actual})`);
      console.log(
        `round ${s.round}: ${nameOf(r.bid.bidderId)} bid ${r.bid.quantity}x${r.bid.face}, ${nameOf(r.challengerId)} called liar, actual ${r.actual} -> ` +
          (r.bidStood ? 'bid stood' : 'bluff') +
          `, ${r.loserId ? nameOf(r.loserId) + ' loses a die' : 'nobody loses'}` +
          (r.eliminatedId ? ` (${nameOf(r.eliminatedId)} is out)` : ''),
      );
      if (roundsResolved >= 3 && !full) break;
    }
    if (lastRevealHandled !== s.round) {
      lastRevealHandled = s.round;
      // Host skips the rest of the reveal on odd rounds; even rounds auto-continue.
      if (s.round % 2 === 1) {
        await settle(500);
        if (latest.state.phase === 'reveal') await req(sock, 'bluffdice:next');
      }
    }
    await settle(300);
    continue;
  }

  if (s.phase === 'bidding' && s.currentPlayerId === hostId && s.players[hostId].diceCount > 0) {
    const mine = s.players[hostId].dice;
    const bid = s.bid;
    const unknown = s.totalDice - mine.length;
    if (bid) {
      const expected = countMatching(mine, bid.face) + unknown / 3;
      // Be suspicious of tall bids; and make sure the human calls liar at least once by round 2.
      const forceCall = challenges === 0 && roundsResolved >= 1 && bid.quantity >= 2;
      if (bid.quantity > expected + 1 || forceCall) {
        await req(sock, 'bluffdice:challenge');
        challenges++;
        console.log(`human: LIAR on ${bid.quantity}x${bid.face} by ${nameOf(bid.bidderId)}`);
        await settle(200);
        continue;
      }
    }
    // Bid on our best face when it's a legal raise; otherwise the minimum.
    let best = minFace;
    for (let f = minFace; f <= 6; f++) if (countMatching(mine, f) > countMatching(mine, best)) best = f;
    let move = null;
    if (!bid) move = { quantity: Math.max(1, countMatching(mine, best)), face: best };
    else if (best > bid.face) move = { quantity: bid.quantity, face: best };
    else move = minimumRaise(bid, s.totalDice);
    if (!move) {
      await req(sock, 'bluffdice:challenge');
      challenges++;
      console.log('human: LIAR (bid was capped)');
    } else {
      await req(sock, 'bluffdice:bid', move);
      bids++;
      console.log(`human: bid ${move.quantity}x${move.face}`);
    }
    await settle(200);
    continue;
  }

  await settle(400);
}

const final = latest.state;
console.log(`\nbids=${bids} challenges=${challenges} roundsResolved=${roundsResolved} phase=${final.phase}`);
assert(roundsResolved >= 3 || final.phase === 'ended', 'at least 3 rounds resolved or the game ended');
assert(bids >= 1, 'human placed at least one bid');
assert(challenges >= 1 || final.phase === 'ended', 'human called liar at least once');
if (final.phase === 'ended') {
  assert(final.winnerId, 'a winner was declared');
  console.log('winner:', nameOf(final.winnerId), '| eliminated:', final.eliminationOrder.map(nameOf).join(', '));
  await req(sock, 'bluffdice:reset');
  await settle();
  assert(latest.state.phase === 'lobby', 'reset returns to lobby');
  assert(latest.state.settings.dicePerPlayer === 3, 'reset keeps settings');
}

console.log('\nBLUFF DICE E2E PASSED');
sock.disconnect();
process.exit(0);
