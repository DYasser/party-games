import {
  giveClue,
  guessTimeUp,
  initialState,
  isGuessTimeUp,
  isRevealTimeUp,
  lockGuess,
  nextRound,
  removeParticipant,
  reset,
  revealTimeUp,
  setGuess,
  setSettings,
  setTeam,
  shuffleTeams,
  skipPsychic,
  startGame,
  teamsReady,
  viewFor,
} from '../../../../shared/spectrum/logic.js';
import type { SpectrumPlayer, SpectrumState } from '../../../../shared/spectrum/types.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type SpecRoom = Room<SpectrumPlayer, SpectrumState>;
type Broadcast = (room: SpecRoom) => void;

/* ------------------------------------------------------------------ */
/* Clocks: the 60s guessing timer and the 12s reveal auto-advance      */
/* ------------------------------------------------------------------ */

const timers = new Map<string, NodeJS.Timeout>();

/** Keep exactly one pending timer per room, matching the current phase. */
function syncTimer(room: SpecRoom, broadcast: Broadcast): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const { state } = room;
  const endsAt =
    state.phase === 'guessing' ? state.round?.guessEndsAt : state.phase === 'reveal' ? state.round?.revealEndsAt : null;
  if (!endsAt) return;

  const delay = Math.max(0, endsAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isGuessTimeUp(room.state, now)) {
        apply(room, guessTimeUp(room.state, now), broadcast);
        broadcast(room);
      } else if (isRevealTimeUp(room.state, now)) {
        apply(room, revealTimeUp(room.state, room.players, now), broadcast);
        broadcast(room);
      } else {
        syncTimer(room, broadcast);
      }
    }, delay),
  );
}

function apply(room: SpecRoom, next: SpectrumState, broadcast: Broadcast): void {
  room.state = next;
  syncTimer(room, broadcast);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

let botBroadcast: Broadcast = () => {};

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Roughly bell-shaped noise: sum of three uniforms in [-1, 1], scaled. */
const noise = (scale: number) => (rand(-1, 1) + rand(-1, 1) + rand(-1, 1)) * scale;

/**
 * Bots never take the psychic seat. As guessers they peek at the target and land
 * near it, one at a time, a few seconds apart. The scheduler also covers the
 * "psychic vanished before cluing" case so the room never stalls.
 */
function planBots(room: SpecRoom): BotPlan | null {
  const { state } = room;
  const round = state.round;
  if (!round) return null;

  if (state.phase === 'clue') {
    const psychic = room.players.find((p) => p.id === round.psychicId);
    if (psychic && psychic.connected && !psychic.isBot) return null;
    return {
      delayMs: 3000,
      run() {
        apply(room, skipPsychic(room.state, room.players, Date.now()), botBroadcast);
      },
    };
  }

  if (state.phase === 'guessing') {
    const bots = room.players.filter((p) => p.isBot && round.guesserIds.includes(p.id));
    const pending = bots.find((b) => !round.guesses[b.id]?.locked);
    if (!pending) return null;
    const anyLocked = bots.some((b) => round.guesses[b.id]?.locked);
    return {
      delayMs: anyLocked ? rand(1000, 3000) : rand(2000, 6000),
      run() {
        const isActive = (id: string) => room.players.some((p) => p.id === id && p.connected);
        const value = clamp(round.target + noise(18));
        const guessed = setGuess(room.state, pending.id, value);
        apply(room, lockGuess(guessed, pending.id, Date.now(), isActive), botBroadcast);
      },
    };
  }

  return null;
}

const bots = new BotScheduler<SpectrumPlayer, SpectrumState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const spectrumModule: GameModule<SpectrumPlayer, SpectrumState> = {
  id: 'spectrum',
  maxPlayers: GAME_INFO.spectrum.maxPlayers,

  createPlayer: (base) => ({ ...base }),
  initialState,
  view: (room, player) => viewFor(room.state, player.id, Date.now()),

  register(socket, { withRoom, requireHost, broadcast }) {
    const update = (room: SpecRoom, next: SpectrumState) => apply(room, next, broadcast);

    socket.on('spectrum:settings', (payload, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const patch: { rounds?: number; mode?: unknown } = {};
        if (payload?.rounds !== undefined) patch.rounds = Number(payload.rounds);
        if (payload?.mode !== undefined) patch.mode = payload.mode;
        update(room, setSettings(room.state, patch));
      }),
    );

    socket.on('spectrum:team', (payload, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        const team = payload?.team;
        // Anything that is not a side benches the player, rather than throwing.
        const side = team === 'red' || team === 'blue' ? team : null;
        update(room, setTeam(room.state, String(payload?.playerId ?? ''), side));
      }),
    );

    socket.on('spectrum:shuffleTeams', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, shuffleTeams(room.state, room.players));
      }),
    );

    socket.on('spectrum:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, startGame(room.state, room.players, Date.now()));
      }),
    );

    socket.on('spectrum:clue', ({ text }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, giveClue(room.state, player.id, String(text ?? ''), Date.now()));
      }),
    );

    socket.on('spectrum:guess', ({ value }, ack) =>
      withRoom(ack, (room, player) => {
        update(room, setGuess(room.state, player.id, Number(value)));
      }),
    );

    socket.on('spectrum:lock', (ack) =>
      withRoom(ack, (room, player) => {
        const isActive = (id: string) => room.players.some((p) => p.id === id && p.connected);
        update(room, lockGuess(room.state, player.id, Date.now(), isActive));
      }),
    );

    socket.on('spectrum:next', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, nextRound(room.state, room.players, Date.now()));
      }),
    );

    socket.on('spectrum:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        update(room, reset(room.state));
      }),
    );
  },

  onPlayerRemoved(room, playerId, { broadcast }) {
    apply(room, removeParticipant(room.state, playerId, room.players, Date.now()), broadcast);
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
