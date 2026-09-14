import {
  BluffDiceError,
  botAction,
  challenge,
  initialState,
  isRevealOver,
  isTurnExpired,
  nextRound,
  placeBid,
  removePlayer,
  reset,
  setSettings,
  startGame,
  turnTimeout,
  viewFor,
} from '../../../../shared/bluffdice/logic.js';
import type { BluffDicePlayer, BluffDiceState } from '../../../../shared/bluffdice/types.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type DiceRoom = Room<BluffDicePlayer, BluffDiceState>;
type Broadcast = (room: DiceRoom) => void;

/* ------------------------------------------------------------------ */
/* Timers: one per room, covering the turn clock and the reveal pause  */
/* ------------------------------------------------------------------ */

const timers = new Map<string, NodeJS.Timeout>();

function syncTimer(room: DiceRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const { state } = room;
  let at: number | null = null;
  if (state.phase === 'bidding') at = state.turnEndsAt;
  else if (state.phase === 'reveal') at = state.revealEndsAt;
  if (at === null) return;

  const delay = Math.max(0, at - Date.now()) + 30;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isTurnExpired(room.state, now)) {
        room.state = turnTimeout(room.state, now);
        broadcast(room);
      } else if (isRevealOver(room.state, now)) {
        room.state = nextRound(room.state, now);
        broadcast(room);
      }
      syncTimer(room, broadcast);
    }, delay),
  );
}

function apply(room: DiceRoom, next: BluffDiceState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

function planBots(room: DiceRoom): BotPlan | null {
  const state = room.state;
  if (state.phase !== 'bidding' || !state.currentPlayerId) return null;
  const bot = room.players.find((p) => p.isBot && p.id === state.currentPlayerId);
  if (!bot) return null;
  return {
    delayMs: rand(2000, 5000),
    run() {
      const s = room.state;
      if (s.phase !== 'bidding' || s.currentPlayerId !== bot.id) return;
      const now = Date.now();
      const action = botAction(s, bot.id);
      const next = action.type === 'challenge' ? challenge(s, bot.id, now) : placeBid(s, bot.id, action.quantity, action.face, now);
      apply(room, next, botBroadcast);
    },
  };
}

const bots = new BotScheduler<BluffDicePlayer, BluffDiceState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const bluffdiceModule: GameModule<BluffDicePlayer, BluffDiceState> = {
  id: 'bluffdice',
  maxPlayers: GAME_INFO.bluffdice.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState,
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: DiceRoom, next: BluffDiceState) => apply(room, next, broadcast);

    socket.on('bluffdice:settings', ({ dicePerPlayer, onesWild }, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, setSettings(room.state, { dicePerPlayer: Number(dicePerPlayer), onesWild: Boolean(onesWild) }));
      }),
    );

    socket.on('bluffdice:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const participants = room.players.filter((p) => p.connected);
        update(room, startGame(room.state, participants, Date.now()));
      }),
    );

    socket.on('bluffdice:bid', ({ quantity, face }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, placeBid(room.state, player.id, Number(quantity), Number(face), Date.now()));
      }),
    );

    socket.on('bluffdice:challenge', (ack) =>
      withRoom(ack, (room, player) => {
        update(room, challenge(room.state, player.id, Date.now()));
      }),
    );

    socket.on('bluffdice:next', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase !== 'reveal') throw new BluffDiceError('There is no reveal to skip.');
        update(room, nextRound(room.state, Date.now()));
      }),
    );

    socket.on('bluffdice:reset', (ack) =>
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
