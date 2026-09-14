import {
  ensureBoard,
  flip,
  initialState,
  isTimeUp,
  removePlayer,
  setSettings,
  settleAll,
  startGame,
  timeUp,
  viewFor,
} from '../../../../shared/pairrush/logic.js';
import type { PairRushPlayer, PairRushState } from '../../../../shared/pairrush/types.js';
import { PEEK_MS } from '../../../../shared/pairrush/types.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type PRRoom = Room<PairRushPlayer, PairRushState>;
type Broadcast = (room: PRRoom) => void;

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/**
 * One pending timer per room. It covers two jobs: ending the race when the
 * overall clock runs out, and turning mismatched pairs back down.
 *
 * The flip-back has to happen server-side even though the client animates it,
 * or a player who stops interacting would leave their board locked forever.
 */
const timers = new Map<string, NodeJS.Timeout>();

function racersOf(room: PRRoom): PairRushPlayer[] {
  return room.players.filter((p) => p.connected);
}

/** The soonest moment the state changes on its own. */
function nextDeadline(state: PairRushState): number | null {
  if (state.phase !== 'playing') return null;
  let soonest = state.endsAt;
  for (const board of Object.values(state.boards)) {
    if (board.peekUntil === null) continue;
    if (soonest === null || board.peekUntil < soonest) soonest = board.peekUntil;
  }
  return soonest;
}

function syncTimer(room: PRRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const dueAt = nextDeadline(room.state);
  if (dueAt === null) return;

  const delay = Math.max(0, dueAt - Date.now()) + 30;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();

      if (isTimeUp(room.state, now)) {
        room.state = timeUp(room.state, now);
        broadcast(room);
        syncTimer(room, broadcast);
        return;
      }

      const settled = settleAll(room.state, now);
      if (settled !== room.state) {
        room.state = settled;
        broadcast(room);
      }
      syncTimer(room, broadcast);
    }, delay),
  );
}

function apply(room: PRRoom, next: PairRushState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

/**
 * A bot plays with a deliberately imperfect memory.
 *
 * It remembers a card it has seen with probability `RECALL`, so it does find
 * pairs and does speed up as the board empties — but it also forgets, which
 * keeps it beatable. A bot that remembered everything would win every race
 * against a human on the first pass.
 */
const RECALL = 0.72;

/** What each bot has seen, per room: card index -> symbol. */
const botMemory = new Map<string, Map<number, string>>();

function memoryFor(roomCode: string, botId: string): Map<number, string> {
  const key = `${roomCode}:${botId}`;
  let mem = botMemory.get(key);
  if (!mem) {
    mem = new Map();
    botMemory.set(key, mem);
  }
  return mem;
}

function forgetRoom(roomCode: string): void {
  for (const key of [...botMemory.keys()]) {
    if (key.startsWith(`${roomCode}:`)) botMemory.delete(key);
  }
}

/** Pick the bot's next card: a remembered match if it has one, else a new card. */
function botPick(room: PRRoom, botId: string): number | null {
  const { state } = room;
  const board = state.boards[botId];
  if (!board || board.finishOrder !== null) return null;

  const mem = memoryFor(room.code, botId);
  const taken = new Set([...board.matched, ...board.flipped]);
  const free = state.deck.map((_, i) => i).filter((i) => !taken.has(i));
  if (free.length === 0) return null;

  // Second card: try to complete the pair it just turned over.
  if (board.flipped.length === 1) {
    const want = state.deck[board.flipped[0]];
    for (const [index, symbol] of mem) {
      if (symbol === want && free.includes(index)) return index;
    }
    return free[Math.floor(Math.random() * free.length)];
  }

  // First card: if it remembers both halves of a pair, go for it.
  const bySymbol = new Map<string, number[]>();
  for (const [index, symbol] of mem) {
    if (!free.includes(index)) continue;
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), index]);
  }
  for (const indices of bySymbol.values()) {
    if (indices.length >= 2) return indices[0];
  }

  // Otherwise explore somewhere it has not been.
  const unseen = free.filter((i) => !mem.has(i));
  const pool = unseen.length > 0 ? unseen : free;
  return pool[Math.floor(Math.random() * pool.length)];
}

const plan = (room: PRRoom): BotPlan | null => {
  const { state } = room;
  if (state.phase !== 'playing') return null;

  const bots = room.players.filter(
    (p) => p.isBot && state.boards[p.id] && state.boards[p.id].finishOrder === null,
  );
  if (bots.length === 0) return null;

  return {
    // Roughly human flipping speed, so the progress bars move believably.
    delayMs: rand(700, 1500),
    run: () => {
      const now = Date.now();
      let changed = false;

      for (const bot of bots) {
        const settled = settleAll(room.state, now);
        if (settled !== room.state) {
          room.state = settled;
          changed = true;
        }

        const board = room.state.boards[bot.id];
        if (!board || board.finishOrder !== null || board.peekUntil !== null) continue;

        const index = botPick(room, bot.id);
        if (index === null) continue;

        try {
          room.state = flip(room.state, bot.id, index, now);
          changed = true;
          // Seeing a card is how a bot learns it — imperfectly.
          if (Math.random() < RECALL) {
            memoryFor(room.code, bot.id).set(index, room.state.deck[index]);
          }
        } catch {
          // The board moved under us; try again on the next tick.
        }
      }

      if (changed) {
        botBroadcast(room);
        syncTimer(room, botBroadcast);
      }
    },
  };
};

const scheduler = new BotScheduler(plan);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const pairrushModule: GameModule<PairRushPlayer, PairRushState> = {
  id: 'pairrush',
  maxPlayers: GAME_INFO.pairrush.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState: () => initialState(),
  view: (room, player) =>
    viewFor(settleAll(room.state, Date.now()), player, room.players, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: PRRoom, next: PairRushState) => apply(room, next, broadcast);

    socket.on('pairrush:settings', (payload, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const patch: { size?: unknown; roundSeconds?: unknown } = {};
        if (payload?.size !== undefined) patch.size = Number(payload.size);
        if (payload?.roundSeconds !== undefined) patch.roundSeconds = Number(payload.roundSeconds);
        update(room, setSettings(room.state, patch));
      }),
    );

    socket.on('pairrush:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        forgetRoom(room.code);
        update(room, startGame(room.state, racersOf(room), Date.now()));
      }),
    );

    socket.on('pairrush:flip', (payload, ack) =>
      withRoom(ack, (room, player) => {
        const now = Date.now();
        // A player who joined after the deal still gets to race.
        const withBoard = ensureBoard(room.state, player.id);
        update(room, flip(withBoard, player.id, Number(payload?.index), now));
      }),
    );

    socket.on('pairrush:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        forgetRoom(room.code);
        update(room, initialState(room.state.settings));
      }),
    );
  },

  botTick(room, hooks) {
    botBroadcast = (r) => hooks.broadcast(r);
    scheduler.tick(room, (r) => hooks.broadcast(r));
  },

  onPlayerRemoved(room, playerId, hooks) {
    const next = removePlayer(room.state, playerId, Date.now());
    if (next === room.state) return;
    room.state = next;
    hooks.broadcast(room);
    syncTimer(room, (r) => hooks.broadcast(r));
  },

  onRoomClosed(room) {
    const timer = timers.get(room.code);
    if (timer) clearTimeout(timer);
    timers.delete(room.code);
    forgetRoom(room.code);
  },
};
