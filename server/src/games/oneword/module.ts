import {
  OneWordError,
  hintProblem,
  initialState,
  isTimeUp,
  nextCard,
  normalizeWord,
  passCard,
  presenceCheck,
  removeParticipant,
  reset,
  setReady,
  startGame,
  submitGuess,
  submitHint,
  survivingHints,
  timeUp,
  toggleCancel,
  viewFor,
} from '../../../../shared/oneword/logic.js';
import type { OneWordPlayer, OneWordState } from '../../../../shared/oneword/types.js';
import { ALL_WORDS, themeOf, wordsOfTheme } from '../../../../shared/oneword/words.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, chance, pick, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type OwRoom = Room<OneWordPlayer, OneWordState>;
type Broadcast = (room: OwRoom) => void;

/** Ids of every seated, connected player. */
const present = (room: OwRoom): string[] => room.players.filter((p) => p.connected).map((p) => p.id);

/* ------------------------------------------------------------------ */
/* Phase clock                                                         */
/* ------------------------------------------------------------------ */

const timers = new Map<string, NodeJS.Timeout>();

/** Fire `timeUp` when the current phase's clock runs out; otherwise make sure nothing is pending. */
function syncTimer(room: OwRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const { state } = room;
  if (state.phaseEndsAt === null) return;

  const delay = Math.max(0, state.phaseEndsAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isTimeUp(room.state, now)) {
        room.state = timeUp(room.state, present(room), now);
        broadcast(room);
      } else {
        syncTimer(room, broadcast);
      }
    }, delay),
  );
}

function apply(room: OwRoom, next: OneWordState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

/** A themed word that is a legal hint for `secret` and not already written by another bot. */
function botHintFor(secret: string, taken: string[]): string {
  const usedKeys = new Set(taken.map(normalizeWord));
  const ok = (w: string) => hintProblem(secret, w) === null && !usedKeys.has(normalizeWord(w));
  const theme = themeOf(secret);
  const themed = theme ? wordsOfTheme(theme).filter(ok) : [];
  if (themed.length) return pick(themed);
  const any = ALL_WORDS.filter(ok);
  return any.length ? pick(any) : 'mystery';
}

/**
 * Bot hinters write a word from the secret's theme; bot reviewers wave the hints through;
 * a bot guesser peeks and gets it right a bit more than half the time.
 */
function planBots(room: OwRoom): BotPlan | null {
  const state = room.state;
  const card = state.card;
  if (!card) return null;
  const isBot = (id: string) => room.players.find((p) => p.id === id)?.isBot === true;

  if (state.phase === 'hinting') {
    const hinter = card.hinterIds.find((id) => isBot(id) && !(id in card.hints));
    if (!hinter) return null;
    return {
      delayMs: rand(2000, 5000),
      run() {
        const taken = Object.values(room.state.card?.hints ?? {})
          .filter((h) => isBot(h.playerId))
          .map((h) => h.text);
        const text = botHintFor(card.word, taken);
        apply(room, submitHint(room.state, hinter, text, present(room), Date.now()), botBroadcast);
      },
    };
  }

  if (state.phase === 'review') {
    const reviewer = card.hinterIds.find((id) => isBot(id) && !card.ready.includes(id));
    if (!reviewer) return null;
    return {
      delayMs: rand(1000, 2000),
      run() {
        apply(room, setReady(room.state, reviewer, present(room), Date.now()), botBroadcast);
      },
    };
  }

  if (state.phase === 'guessing' && isBot(card.guesserId)) {
    return {
      delayMs: rand(3000, 6000),
      run() {
        const now = Date.now();
        const alive = survivingHints(card);
        if (alive.length === 0) {
          apply(room, passCard(room.state, card.guesserId, now), botBroadcast);
          return;
        }
        let guess = card.word;
        if (!chance(0.55)) {
          const theme = themeOf(alive[0].text) ?? themeOf(card.word);
          const pool = (theme ? wordsOfTheme(theme) : ALL_WORDS).filter((w) => w !== card.word);
          guess = pool.length ? pick(pool) : pick(ALL_WORDS.slice());
        }
        apply(room, submitGuess(room.state, card.guesserId, guess, now), botBroadcast);
      },
    };
  }

  return null;
}

const bots = new BotScheduler<OneWordPlayer, OneWordState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const onewordModule: GameModule<OneWordPlayer, OneWordState> = {
  id: 'oneword',
  maxPlayers: GAME_INFO.oneword.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState,
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: OwRoom, next: OneWordState) => apply(room, next, broadcast);

    socket.on('oneword:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const participants = room.players.filter((p) => p.connected);
        update(room, startGame(room.state, participants, Date.now()));
      }),
    );

    socket.on('oneword:hint', ({ text }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, submitHint(room.state, player.id, String(text ?? ''), present(room), Date.now()));
      }),
    );

    socket.on('oneword:cancel', ({ playerId }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, toggleCancel(room.state, player.id, String(playerId ?? '')));
      }),
    );

    socket.on('oneword:ready', (ack) =>
      withRoom(ack, (room, player) => {
        update(room, setReady(room.state, player.id, present(room), Date.now()));
      }),
    );

    socket.on('oneword:guess', ({ text }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, submitGuess(room.state, player.id, String(text ?? ''), Date.now()));
      }),
    );

    socket.on('oneword:pass', (ack) =>
      withRoom(ack, (room, player) => {
        update(room, passCard(room.state, player.id, Date.now()));
      }),
    );

    socket.on('oneword:next', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase !== 'result') throw new OneWordError('The current card is not finished.');
        update(room, nextCard(room.state, Date.now()));
      }),
    );

    socket.on('oneword:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, reset());
      }),
    );
  },

  onPlayerRemoved(room, playerId, { broadcast }) {
    apply(room, removeParticipant(room.state, playerId, present(room), Date.now()), broadcast);
  },

  botTick(room, { broadcast }) {
    botBroadcast = broadcast;
    // A hinter who dropped must not hold the card up: re-check readiness against who is online.
    const next = presenceCheck(room.state, present(room), Date.now());
    if (next !== room.state) {
      apply(room, next, broadcast);
      broadcast(room); // re-enters botTick with the new phase
      return;
    }
    bots.tick(room, broadcast);
  },

  onRoomClosed(room) {
    const t = timers.get(room.code);
    if (t) clearTimeout(t);
    timers.delete(room.code);
    bots.cancel(room.code);
  },
};
