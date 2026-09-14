import { CATEGORIES, startsWithLetter } from '../../../../shared/letterrush/categories.js';
import {
  LetterRushError,
  finishReview,
  initialState,
  isTimeUp,
  markDone,
  nextRound,
  removeParticipant,
  reset,
  setSettings,
  startGame,
  submitAnswer,
  timeUp,
  toggleFlag,
  viewFor,
} from '../../../../shared/letterrush/logic.js';
import type { LetterRushPlayer, LetterRushState } from '../../../../shared/letterrush/types.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, chance, pick, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type LRRoom = Room<LetterRushPlayer, LetterRushState>;
type Broadcast = (room: LRRoom) => void;

const participantsOf = (room: LRRoom) => room.players.filter((p) => p.connected);

/* ------------------------------------------------------------------ */
/* Phase clock                                                         */
/* ------------------------------------------------------------------ */

const timers = new Map<string, NodeJS.Timeout>();

/** Fire when the current timed phase (writing / review / scores) reaches its deadline. */
function syncTimer(room: LRRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const { state } = room;
  if (!state.round) return;
  if (state.phase !== 'writing' && state.phase !== 'review' && state.phase !== 'scores') return;

  const delay = Math.max(0, state.round.endsAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isTimeUp(room.state, now)) {
        room.state = timeUp(room.state, now, participantsOf(room));
        syncTimer(room, broadcast);
        broadcast(room);
      } else {
        syncTimer(room, broadcast);
      }
    }, delay),
  );
}

function apply(room: LRRoom, next: LetterRushState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

/**
 * Each bot gets its own "I'll be done at" moment per phase so they finish
 * independently (3-10s to write, 2-4s to review) instead of in lockstep.
 * Key: room code -> `${round}:${phase}:${botId}` -> fire time.
 */
const botDeadlines = new Map<string, Map<string, number>>();

function deadlineFor(room: LRRoom, key: string, minMs: number, maxMs: number): number {
  let perRoom = botDeadlines.get(room.code);
  if (!perRoom) {
    perRoom = new Map();
    botDeadlines.set(room.code, perRoom);
  }
  let at = perRoom.get(key);
  if (at === undefined) {
    at = Date.now() + rand(minMs, maxMs);
    perRoom.set(key, at);
  }
  return at;
}

/** Pick an example that starts with the letter: the first one half the time, a random one otherwise. */
function botAnswer(categoryName: string, letter: string): string {
  const category = CATEGORIES.find((c) => c.name === categoryName);
  if (!category) return '';
  const matching = category.examples.filter((e) => startsWithLetter(e, letter));
  if (matching.length === 0) return '';
  return chance(0.5) ? matching[0] : pick(matching);
}

function planBots(room: LRRoom): BotPlan | null {
  const state = room.state;
  const round = state.round;
  if (!round) return null;
  const active = new Set(round.participantIds.filter((id) => !round.leftIds.includes(id)));
  const bots = room.players.filter((p) => p.isBot && active.has(p.id));
  if (bots.length === 0) return null;

  if (state.phase === 'writing') {
    const pending = bots.filter((b) => !round.doneWriting.includes(b.id));
    if (pending.length === 0) return null;
    const timed = pending.map((b) => ({ bot: b, at: deadlineFor(room, `${round.number}:writing:${b.id}`, 3000, 10_000) }));
    timed.sort((x, y) => x.at - y.at);
    const { bot, at } = timed[0];
    return {
      delayMs: Math.max(0, at - Date.now()),
      run() {
        let next = room.state;
        if (next.phase !== 'writing' || !next.round) return;
        next.round.categories.forEach((name, i) => {
          const text = botAnswer(name, next.round!.letter);
          if (text) next = submitAnswer(next, bot.id, i, text);
        });
        apply(room, markDone(next, bot.id, Date.now()), botBroadcast);
      },
    };
  }

  if (state.phase === 'review') {
    const pending = bots.filter((b) => !round.doneReviewing.includes(b.id));
    if (pending.length === 0) return null;
    const timed = pending.map((b) => ({ bot: b, at: deadlineFor(room, `${round.number}:review:${b.id}`, 2000, 4000) }));
    timed.sort((x, y) => x.at - y.at);
    const { bot, at } = timed[0];
    return {
      delayMs: Math.max(0, at - Date.now()),
      run() {
        if (room.state.phase !== 'review') return;
        apply(room, markDone(room.state, bot.id, Date.now()), botBroadcast);
      },
    };
  }

  return null;
}

const bots = new BotScheduler<LetterRushPlayer, LetterRushState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const letterrushModule: GameModule<LetterRushPlayer, LetterRushState> = {
  id: 'letterrush',
  maxPlayers: GAME_INFO.letterrush.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState,
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: LRRoom, next: LetterRushState) => apply(room, next, broadcast);

    socket.on('letterrush:settings', ({ rounds, roundSeconds }, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, setSettings(room.state, Number(rounds), Number(roundSeconds)));
      }),
    );

    socket.on('letterrush:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        botDeadlines.delete(room.code);
        update(room, startGame(room.state, participantsOf(room), Date.now()));
      }),
    );

    socket.on('letterrush:answer', ({ categoryIndex, text }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, submitAnswer(room.state, player.id, Number(categoryIndex), String(text ?? '')));
      }),
    );

    socket.on('letterrush:done', (ack) =>
      withRoom(ack, (room, player) => {
        update(room, markDone(room.state, player.id, Date.now()));
      }),
    );

    socket.on('letterrush:flag', ({ categoryIndex, playerId }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, toggleFlag(room.state, player.id, Number(categoryIndex), String(playerId ?? '')));
      }),
    );

    socket.on('letterrush:finishReview', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, finishReview(room.state, Date.now()));
      }),
    );

    socket.on('letterrush:next', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase !== 'scores') throw new LetterRushError('The round is not over yet.');
        update(room, nextRound(room.state, participantsOf(room), Date.now()));
      }),
    );

    socket.on('letterrush:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        botDeadlines.delete(room.code);
        update(room, reset(room.state));
      }),
    );
  },

  onPlayerRemoved(room, playerId, { broadcast }) {
    apply(room, removeParticipant(room.state, playerId, Date.now()), broadcast);
  },

  botTick(room, { broadcast }) {
    botBroadcast = broadcast;
    bots.tick(room, broadcast);
  },

  onRoomClosed(room) {
    const t = timers.get(room.code);
    if (t) clearTimeout(t);
    timers.delete(room.code);
    botDeadlines.delete(room.code);
    bots.cancel(room.code);
  },
};
