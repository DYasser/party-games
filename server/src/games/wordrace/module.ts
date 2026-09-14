import {
  advance,
  botGuess as chooseBotGuess,
  initialState,
  isRevealOver,
  isTimeUp,
  removeParticipant,
  reset,
  setSettings,
  startGame,
  submitGuess,
  timeUp,
  viewFor,
} from '../../../../shared/wordrace/logic.js';
import type { WordRacePlayer, WordRaceState } from '../../../../shared/wordrace/types.js';
import { parseCustomList } from '../../../../shared/wordrace/dictionary.js';
import { getDictionary } from '../../../../shared/wordrace/dictionary.js';
import { isLanguageCode } from '../../../../shared/wordrace/languages.js';
import { loadWordRaceDictionaries } from './dictionaries.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, pick, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type WRRoom = Room<WordRacePlayer, WordRaceState>;
type Broadcast = (room: WRRoom) => void;

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** One pending timer per room: round time-up while playing, auto-advance while revealing. */
const timers = new Map<string, NodeJS.Timeout>();

function participantsOf(room: WRRoom): WordRacePlayer[] {
  return room.players.filter((p) => p.connected);
}

function syncTimer(room: WRRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const { state } = room;
  let dueAt: number | null = null;
  if (state.phase === 'playing' && state.round) dueAt = state.round.endsAt;
  else if (state.phase === 'reveal' && state.round?.revealEndsAt !== null && state.round) dueAt = state.round.revealEndsAt;
  if (dueAt === null) return;

  const delay = Math.max(0, dueAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isTimeUp(room.state, now)) {
        room.state = timeUp(room.state, now);
        broadcast(room);
        syncTimer(room, broadcast); // now in reveal: schedule the auto-advance
      } else if (isRevealOver(room.state, now)) {
        room.state = advance(room.state, participantsOf(room), now);
        broadcast(room);
        syncTimer(room, broadcast);
      } else {
        syncTimer(room, broadcast); // not due yet; wait again
      }
    }, delay),
  );
}

/** Apply a state transition and keep the clock in sync. */
function apply(room: WRRoom, next: WordRaceState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

/**
 * Each bot has its own "thinking" deadline for its next guess (5-10s), keyed by
 * room, bot and round so a stale deadline never carries into the next round.
 */
const botDueAt = new Map<string, number>();
const botKey = (room: WRRoom, botId: string) => `${room.code}:${botId}:${room.state.round?.number ?? 0}`;

function clearBotDeadlines(code: string): void {
  for (const key of botDueAt.keys()) if (key.startsWith(`${code}:`)) botDueAt.delete(key);
}

/** A plausible next guess, drawn from whatever pool this game is using. */
function botGuess(room: WRRoom, botId: string): string {
  const board = room.state.round!.boards[botId];
  return chooseBotGuess(board, room.state.settings, pick);
}

function planBots(room: WRRoom): BotPlan | null {
  const { state } = room;
  const round = state.round;
  if (state.phase !== 'playing' || !round) return null;
  const now = Date.now();
  const solving = room.players.filter(
    (p) => p.isBot && round.participantIds.includes(p.id) && round.boards[p.id]?.status === 'solving',
  );
  if (solving.length === 0) return null;

  let next: WordRacePlayer | null = null;
  let nextAt = Infinity;
  for (const bot of solving) {
    const key = botKey(room, bot.id);
    let due = botDueAt.get(key);
    if (due === undefined) {
      due = now + rand(5000, 10_000);
      botDueAt.set(key, due);
    }
    if (due < nextAt) {
      nextAt = due;
      next = bot;
    }
  }
  if (!next) return null;
  const bot = next;

  return {
    delayMs: Math.max(0, nextAt - now),
    run() {
      botDueAt.delete(botKey(room, bot.id));
      if (room.state.phase !== 'playing' || room.state.round?.boards[bot.id]?.status !== 'solving') return;
      apply(room, submitGuess(room.state, bot.id, botGuess(room, bot.id), Date.now()), botBroadcast);
    },
  };
}

const bots = new BotScheduler<WordRacePlayer, WordRaceState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

// Word lists are read from disk once, the first time this module is used.
loadWordRaceDictionaries();

export const wordraceModule: GameModule<WordRacePlayer, WordRaceState> = {
  id: 'wordrace',
  maxPlayers: GAME_INFO.wordrace.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState: () => initialState(),
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: WRRoom, next: WordRaceState) => apply(room, next, broadcast);

    socket.on('wordrace:settings', (payload, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const patch: { rounds?: number; roundSeconds?: number; language?: string; customWords?: string } = {};
        if (payload?.rounds !== undefined) patch.rounds = Number(payload.rounds);
        if (payload?.roundSeconds !== undefined) patch.roundSeconds = Number(payload.roundSeconds);
        if (payload?.language !== undefined) patch.language = String(payload.language);
        if (payload?.customWords !== undefined) patch.customWords = String(payload.customWords);
        update(room, setSettings(room.state, patch));
      }),
    );

    // Preview a pasted list without committing it, so the host can fix typos first.
    socket.on('wordrace:checkList', (payload, ack) => {
      const { words, rejected } = parseCustomList(String(payload?.text ?? ''));
      const language = isLanguageCode(payload?.language) ? payload.language : 'en';
      const dict = getDictionary(language);
      ack({
        ok: true,
        data: {
          accepted: words,
          rejected,
          notInDictionary: words.filter((w) => !dict.guesses.has(w)),
        },
      });
    });

    socket.on('wordrace:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        clearBotDeadlines(room.code);
        update(room, startGame(room.state, participantsOf(room), Date.now()));
      }),
    );

    socket.on('wordrace:guess', (payload, ack) =>
      withRoom(ack, (room, player) => {
        update(room, submitGuess(room.state, player.id, String(payload?.word ?? ''), Date.now()));
      }),
    );

    socket.on('wordrace:next', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, advance(room.state, participantsOf(room), Date.now()));
      }),
    );

    socket.on('wordrace:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        clearBotDeadlines(room.code);
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
    clearBotDeadlines(room.code);
    bots.cancel(room.code);
  },
};
