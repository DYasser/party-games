import {
  NightfallError,
  eligibleTargets,
  initialState,
  isDayTimeUp,
  isNightTimeUp,
  nightAction,
  nightReady,
  pendingNightActors,
  phaseEndsAt,
  removePlayer,
  reset,
  resolveDay,
  skipNightTurn,
  setSettings,
  startGame,
  viewFor,
  vote,
  living,
} from '../../../../shared/nightfall/logic.js';
import type { NightfallPlayer, NightfallState } from '../../../../shared/nightfall/types.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, chance, pick, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type NfRoom = Room<NightfallPlayer, NightfallState>;
type Broadcast = (room: NfRoom) => void;

/* ------------------------------------------------------------------ */
/* Phase clock                                                         */
/* ------------------------------------------------------------------ */

/** One pending phase-timeout timer per room. */
const timers = new Map<string, NodeJS.Timeout>();

/** Fire when the current night or day runs out of time; otherwise make sure nothing is pending. */
function syncTimer(room: NfRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const endsAt = phaseEndsAt(room.state);
  if (endsAt === null) return;

  const delay = Math.max(0, endsAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      const state = room.state;
      if (isNightTimeUp(state, now)) {
        // Only the waking role is out of time; the night continues with the next.
        room.state = skipNightTurn(state, now);
        broadcast(room);
      } else if (isDayTimeUp(state, now)) {
        room.state = resolveDay(state, now);
        broadcast(room);
      } else {
        syncTimer(room, broadcast); // phase changed under us; wait for the new deadline
      }
    }, delay),
  );
}

/** Apply a state transition and keep the clock in sync. */
function apply(room: NfRoom, next: NightfallState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

/**
 * Bots peek a little so they play plausibly but fallibly: Shade bots sometimes go for
 * the Oracle, town bots sometimes vote for a real Shade, and nobody ever acts for a human.
 */
function planBots(room: NfRoom): BotPlan | null {
  const state = room.state;
  const botIds = new Set(room.players.filter((p) => p.isBot).map((p) => p.id));

  if (state.phase === 'night' && state.night) {
    // Roles wake one at a time, so only bots holding the awake role may move.
    const turn = state.night.turn;
    const pending = pendingNightActors(state).filter(
      (id) => botIds.has(id) && state.roles[id] === turn,
    );
    if (pending.length === 0) return null;
    const actor = pending[0];
    return {
      delayMs: rand(2500, 6000) / pending.length,
      run() {
        const s = room.state;
        // The turn may have moved on while this was queued.
        if (s.phase !== 'night' || s.night?.turn !== s.roles[actor]) return;
        const options = eligibleTargets(s, actor);
        if (options.length === 0) return;
        const role = s.roles[actor];
        let target: string;
        if (role === 'shade') {
          const oracle = options.find((id) => s.roles[id] === 'oracle');
          target = oracle && chance(0.3) ? oracle : pick(options);
        } else if (role === 'oracle') {
          const seen = new Set((s.oracleResults[actor] ?? []).map((r) => r.targetId));
          const unseen = options.filter((id) => !seen.has(id));
          target = pick(unseen.length ? unseen : options);
        } else {
          target = pick(options);
        }
        // Bots decide and commit in one beat; a provisional pick would stall the night.
        const picked = nightAction(s, actor, target, Date.now());
        apply(room, nightReady(picked, actor, Date.now()), botBroadcast);
      },
    };
  }

  if (state.phase === 'day' && state.day) {
    const votes = state.day.votes;
    const pending = living(state).filter((id) => botIds.has(id) && !(id in votes));
    if (pending.length === 0) return null;
    const voter = pending[0];
    return {
      delayMs: rand(8000, 20_000) / pending.length,
      run() {
        const s = room.state;
        if (s.phase !== 'day') return;
        const alive = living(s).filter((id) => id !== voter);
        if (alive.length === 0) return;
        const shades = alive.filter((id) => s.roles[id] === 'shade');
        let target: string | null;
        if (s.roles[voter] === 'shade') {
          const townies = alive.filter((id) => s.roles[id] !== 'shade');
          target = pick(townies.length ? townies : alive);
        } else {
          const roll = Math.random();
          if (roll < 0.35 && shades.length) target = pick(shades);
          else if (roll < 0.5) target = null;
          else target = pick(alive);
        }
        apply(room, vote(s, voter, target, Date.now()), botBroadcast);
      },
    };
  }

  return null;
}

const bots = new BotScheduler<NightfallPlayer, NightfallState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const nightfallModule: GameModule<NightfallPlayer, NightfallState> = {
  id: 'nightfall',
  maxPlayers: GAME_INFO.nightfall.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState,
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: NfRoom, next: NightfallState) => apply(room, next, broadcast);

    socket.on('nightfall:settings', (patch, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        // Only the fields the host actually sent are validated and applied.
        update(room, setSettings(room.state, patch ?? {}));
      }),
    );

    socket.on('nightfall:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const participants = room.players.filter((p) => p.connected);
        update(room, startGame(room.state, participants, Date.now()));
      }),
    );

    socket.on('nightfall:nightReady', (ack) =>
      withRoom(ack, (room, player) => {
        update(room, nightReady(room.state, player.id, Date.now()));
      }),
    );

    socket.on('nightfall:nightAction', ({ targetId }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, nightAction(room.state, player.id, String(targetId ?? ''), Date.now()));
      }),
    );

    socket.on('nightfall:vote', ({ targetId }, ack) =>
      withRoom(ack, (room, player) => {
        const target = targetId === null || targetId === undefined ? null : String(targetId);
        update(room, vote(room.state, player.id, target, Date.now()));
      }),
    );

    socket.on('nightfall:callVote', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase !== 'day') throw new NightfallError('There is no vote to call.');
        if (!room.state.settings.hostCanCallVote) {
          throw new NightfallError('Calling the vote early is switched off for this game.');
        }
        update(room, resolveDay(room.state, Date.now()));
      }),
    );

    socket.on('nightfall:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, reset(room.state));
      }),
    );
  },

  onPlayerRemoved(room, playerId, { broadcast }) {
    apply(room, removePlayer(room.state, playerId, Date.now()), broadcast);
  },

  botTick(room, { broadcast }) {
    botBroadcast = broadcast;
    bots.tick(room, broadcast);
  },

  onRoomClosed(room) {
    const t = timers.get(room.code);
    if (t) clearTimeout(t);
    timers.delete(room.code);
    bots.cancel(room.code);
  },
};
