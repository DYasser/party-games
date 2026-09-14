// End-to-end check of the end-game celebration channel: reactions and confetti
// relayed between real clients, plus server-side rate limiting.
// Usage: E2E_URL=http://localhost:3400 node scripts/e2e-celebration.mjs
import { connect, req, settle, assert, rejects } from './e2e-lib.mjs';

// Mirrors REACTION_BURST in shared/celebration.ts (plain Node cannot import TS).
const REACTION_BURST = 12;
const REACTION_BURST_WINDOW_MS = 3000;

const log = (...a) => console.log(...a);

// Two humans in one room, so we can watch a reaction cross between clients.
const host = await connect();
const guest = await connect();

const hostSeen = [];
const guestSeen = [];
const hostConfetti = [];
const guestConfetti = [];
host.on('celebrate:reaction', (e) => hostSeen.push(e));
guest.on('celebrate:reaction', (e) => guestSeen.push(e));
host.on('celebrate:confetti', (e) => hostConfetti.push(e));
guest.on('celebrate:confetti', (e) => guestConfetti.push(e));

let hostView = null;
host.on('room:state', (v) => (hostView = v));

const { code } = await req(host, 'room:create', { game: 'spectrum', name: 'Ynabi', playerId: 'celeb-host-0001' });
await req(guest, 'room:join', { code, name: 'Sam', playerId: 'celeb-guest-001' });
await settle();
const hostId = hostView.you.id;
const guestId = hostView.players.find((p) => p.id !== hostId).id;
log(`room ${code} with ${hostView.players.length} players`);

// ---- a reaction reaches everyone, including the thrower ----------------------
await req(host, 'celebrate:react', { toId: guestId, which: 'poke' });
await settle(120);
assert(guestSeen.length === 1, `guest received the poke (${guestSeen.length})`);
assert(hostSeen.length === 1, 'thrower also sees it, so their own screen animates');
const poke = guestSeen[0];
assert(poke.fromId === hostId, 'fromId is the thrower');
assert(poke.fromName === 'Ynabi', `fromName carried (${poke.fromName})`);
assert(poke.toId === guestId, 'toId is the target');
assert(poke.which === 'poke', 'reaction key carried');
assert(typeof poke.at === 'number' && poke.at > 0, 'server timestamp present');
log('reaction relayed to both clients with the right payload');

// ---- reactions travel the other way too -------------------------------------
await req(guest, 'celebrate:react', { toId: hostId, which: 'salt' });
await settle(120);
assert(hostSeen.length === 2 && hostSeen[1].which === 'salt', 'guest can throw back');
log('reactions work in both directions');

// ---- validation --------------------------------------------------------------
await rejects(req(host, 'celebrate:react', { toId: guestId, which: 'nonsense' }), 'unknown reaction');
await rejects(req(host, 'celebrate:react', { toId: 'nobody', which: 'clap' }), 'unknown target');

// You may react to yourself; it is harmless and some people will want to.
// Wait for the window to slide so this is not mistaken for throttling.
await settle(REACTION_BURST_WINDOW_MS + 200);
await req(host, 'celebrate:react', { toId: hostId, which: 'crown' });
await settle(120);
const crowns = hostSeen.filter((e) => e.which === 'crown' && e.toId === hostId);
assert(crowns.length === 1, `self-reaction allowed (${crowns.length})`);
log('validation rejects bad input, allows self-reactions');

// ---- rapid tapping and rate limiting ----------------------------------------
// Drain the window first so earlier throws do not eat into the allowance.
await settle(REACTION_BURST_WINDOW_MS + 300);
const fireBefore = hostSeen.filter((e) => e.which === 'fire').length;
const spam = REACTION_BURST + 10;
for (let i = 0; i < spam; i++) {
  await req(guest, 'celebrate:react', { toId: hostId, which: 'fire' });
}
await settle(300);
const got = hostSeen.filter((e) => e.which === 'fire').length - fireBefore;
assert(got >= REACTION_BURST - 2, `a fast tapper gets plenty through (${got} of ${spam})`);
assert(got <= REACTION_BURST, `but spam is capped (${got} delivered, cap ${REACTION_BURST})`);
log(`rapid tapping: ${got} of ${spam} delivered (cap ${REACTION_BURST})`);

// Throttled throws still ack ok, so the client shows no error toast per tap.
log('throttled throws ack without an error');

// ---- confetti ----------------------------------------------------------------
await settle(REACTION_BURST_WINDOW_MS + 200); // let the burst window drain
await req(guest, 'celebrate:confetti');
await settle(120);
assert(hostConfetti.length === 1, 'host sees the guest confetti');
assert(guestConfetti.length === 1, 'guest sees their own confetti');
assert(hostConfetti[0].fromName === 'Sam', `confetti credits the firer (${hostConfetti[0].fromName})`);
log('confetti cannon reaches the whole room');

// ---- reactions never touch game state ---------------------------------------
const phaseBefore = hostView.state.phase;
await req(host, 'celebrate:react', { toId: guestId, which: 'clap' });
await settle(120);
assert(hostView.state.phase === phaseBefore, 'game phase unchanged by reactions');
log('celebration is cosmetic: no game state touched');

log('\nCELEBRATION E2E PASSED');
host.disconnect();
guest.disconnect();
process.exit(0);
