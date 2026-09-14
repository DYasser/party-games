import { LOCATION_NAMES } from '../../../../shared/infiltrator/locations.js';
import {
  InfiltratorError,
  accuse,
  finalVote,
  initialState,
  isTimeUp,
  removeParticipant,
  reset,
  setSettings,
  spyGuess,
  startRound,
  tallyFinalVotes,
  timeUp,
  viewFor,
  voteAccusation,
} from '../../../../shared/infiltrator/logic.js';
import type { InfiltratorPlayer, InfiltratorState } from '../../../../shared/infiltrator/types.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, chance, pick, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type InfRoom = Room<InfiltratorPlayer, InfiltratorState>;
type Broadcast = (room: InfRoom) => void;

/* ------------------------------------------------------------------ */
/* Round clock                                                         */
/* ------------------------------------------------------------------ */

/** One pending "time is up" timer per room. */
const timers = new Map<string, NodeJS.Timeout>();

/**
 * Keep the server-side clock in step with the state: while a round is running and
 * not paused, fire when endsAt is reached; otherwise make sure nothing is pending.
 */
function syncTimer(room: InfRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const { state } = room;
  if (state.phase !== 'playing' || !state.round || state.round.pausedAt !== null) return;

  const delay = Math.max(0, state.round.endsAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isTimeUp(room.state, now)) {
        room.state = timeUp(room.state, now);
        broadcast(room);
      } else {
        syncTimer(room, broadcast); // clock was extended; wait again
      }
    }, delay),
  );
}

/** Apply a state transition and keep the clock in sync. */
function apply(room: InfRoom, next: InfiltratorState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

/**
 * Bots can't talk, so they play on instinct: they vote sensibly on accusations,
 * occasionally accuse someone (often the right person), and a bot spy will
 * eventually take a stab at the location.
 */
function planBots(room: InfRoom): BotPlan | null {
  const state = room.state;
  const round = state.round;
  if (!round) return null;
  const bots = room.players.filter((p) => p.isBot && round.participantIds.includes(p.id));
  if (bots.length === 0) return null;
  const others = (id: string) => round.participantIds.filter((pid) => pid !== id);

  if (state.phase === 'playing' && round.accusation) {
    const acc = round.accusation;
    const voter = bots.find((b) => b.id !== acc.accusedId && !(b.id in acc.votes));
    if (!voter) return null;
    return {
      delayMs: rand(1200, 3000),
      run() {
        const guilty = acc.accusedId === round.spyId;
        const agree = guilty ? chance(0.9) : chance(0.15);
        apply(room, voteAccusation(room.state, voter.id, agree, Date.now()), botBroadcast);
      },
    };
  }

  if (state.phase === 'playing') {
    return {
      delayMs: rand(15_000, 35_000),
      run() {
        const roll = Math.random();
        const spyBot = bots.find((b) => b.id === round.spyId);
        if (spyBot && roll < 0.3) {
          const location = chance(0.5) ? round.location : pick(LOCATION_NAMES.filter((n) => n !== round.location));
          apply(room, spyGuess(room.state, spyBot.id, location), botBroadcast);
          return;
        }
        const accusers = bots.filter((b) => b.id !== round.spyId && !round.accusedBy.includes(b.id));
        if (accusers.length && roll < 0.75) {
          const accuser = pick(accusers);
          const innocents = others(accuser.id).filter((id) => id !== round.spyId);
          const target = chance(0.5) || innocents.length === 0 ? round.spyId : pick(innocents);
          apply(room, accuse(room.state, accuser.id, target, Date.now()), botBroadcast);
        }
        // otherwise: keep "chatting"; the broadcast after this reschedules us.
      },
    };
  }

  if (state.phase === 'voting') {
    const voter = bots.find((b) => !(b.id in round.finalVotes));
    if (!voter) return null;
    return {
      delayMs: rand(1500, 4000),
      run() {
        const canPickSpy = voter.id !== round.spyId;
        const suspect = canPickSpy && chance(0.7) ? round.spyId : pick(others(voter.id));
        apply(room, finalVote(room.state, voter.id, suspect), botBroadcast);
      },
    };
  }

  return null;
}

const bots = new BotScheduler<InfiltratorPlayer, InfiltratorState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const infiltratorModule: GameModule<InfiltratorPlayer, InfiltratorState> = {
  id: 'infiltrator',
  maxPlayers: GAME_INFO.infiltrator.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState,
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: InfRoom, next: InfiltratorState) => apply(room, next, broadcast);

    socket.on('infiltrator:settings', ({ roundSeconds }, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, setSettings(room.state, Number(roundSeconds)));
      }),
    );

    socket.on('infiltrator:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const participants = room.players.filter((p) => p.connected);
        update(room, startRound(room.state, participants, Date.now()));
      }),
    );

    socket.on('infiltrator:accuse', ({ accusedId }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, accuse(room.state, player.id, String(accusedId ?? ''), Date.now()));
      }),
    );

    socket.on('infiltrator:vote', ({ agree }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, voteAccusation(room.state, player.id, Boolean(agree), Date.now()));
      }),
    );

    socket.on('infiltrator:guess', ({ location }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, spyGuess(room.state, player.id, String(location ?? '')));
      }),
    );

    socket.on('infiltrator:finalVote', ({ playerId }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, finalVote(room.state, player.id, String(playerId ?? '')));
      }),
    );

    socket.on('infiltrator:reveal', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase !== 'voting') throw new InfiltratorError('There is no final vote to reveal.');
        update(room, tallyFinalVotes(room.state));
      }),
    );

    socket.on('infiltrator:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, reset());
      }),
    );
  },

  onPlayerRemoved(room, playerId, { broadcast }) {
    apply(room, removeParticipant(room.state, playerId), broadcast);
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
