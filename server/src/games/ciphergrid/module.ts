import {
  GameError,
  createGame,
  emptyGame,
  endTurn,
  giveClue,
  guess,
  isTurnTimeUp,
  setSettings,
  turnTimeout,
  randomizeTeams,
  remainingCards,
  shuffle,
  teamsReady,
  validateClueWord,
  viewFor,
} from '../../../../shared/ciphergrid/logic.js';
import type { CardType, GameState, Player, Team } from '../../../../shared/ciphergrid/types.js';
import { WORDS } from '../../../../shared/ciphergrid/words.js';
import { GAME_INFO, type Room } from '../../../../shared/room.js';
import { BotScheduler, chance, pick, rand, type BotPlan } from '../bots.js';
import type { GameModule } from '../module.js';

type CGRoom = Room<Player, GameState>;

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

const TEAMS: Team[] = ['red', 'blue'];

/** Can this bot leave its seat without breaking its team's readiness? */
function isSpare(room: CGRoom, bot: Player): boolean {
  if (!bot.team) return true;
  const rest = room.players.filter((p) => p.team === bot.team && p.id !== bot.id);
  return rest.some((p) => p.role === 'spymaster') && rest.some((p) => p.role === 'operative');
}

/**
 * Move bots (never humans) into whatever seats are still empty so both teams
 * have a spymaster and an operative. Runs when bots are added and on Start,
 * so humans can pick any seat and the bots shuffle around them.
 */
function fillSeatsWithBots(room: CGRoom): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const role of ['spymaster', 'operative'] as const) {
      for (const team of TEAMS) {
        const filled = room.players.some((p) => p.team === team && p.role === role);
        if (filled) continue;
        const bots = room.players.filter((p) => p.isBot && !(p.team === team && p.role === role));
        // Only move a bot that is unseated or whose team can spare it; never rob a needed seat.
        const bot = bots.find((b) => !b.team) ?? bots.find((b) => isSpare(room, b));
        if (!bot) continue;
        bot.team = team;
        bot.role = role;
      }
    }
  }
}

/** Seat a new bot: fill a missing role first, otherwise join the smaller team as an operative. */
function seatBot(room: CGRoom, bot: Player): void {
  fillSeatsWithBots(room);
  if (bot.team) return;
  const count = (team: Team) => room.players.filter((p) => p.team === team).length;
  bot.team = count('red') <= count('blue') ? 'red' : 'blue';
  bot.role = 'operative';
}

function pickClueWord(state: GameState): string {
  return shuffle(WORDS).find((w) => !/\s/.test(w) && validateClueWord(w, state) === null) ?? 'HINT';
}

/**
 * Bots peek at the key so the game moves along, but they are deliberately
 * fallible: mostly right, sometimes a bystander, rarely a disaster.
 */
function chooseGuess(state: GameState, team: Team): number {
  const roll = Math.random();
  const want: CardType = roll < 0.65 ? team : roll < 0.9 ? 'neutral' : roll < 0.98 ? (team === 'red' ? 'blue' : 'red') : 'assassin';
  const candidates = (type: CardType) =>
    state.cards.map((c, i) => (!c.revealed && c.type === type ? i : -1)).filter((i) => i >= 0);
  const preferred = candidates(want);
  if (preferred.length) return pick(preferred);
  return pick(state.cards.map((c, i) => (c.revealed ? -1 : i)).filter((i) => i >= 0));
}

/** Decide the next bot move for this room, if any. Humans always get to act in their own role. */
function planBots(room: CGRoom): BotPlan | null {
  const state = room.state;
  if (state.phase !== 'playing') return null;
  const team = state.turn;
  const members = room.players.filter((p) => p.team === team);
  const spymaster = members.find((p) => p.role === 'spymaster');

  if (!state.currentClue) {
    if (!spymaster?.isBot) return null;
    return {
      delayMs: rand(2500, 5000),
      run() {
        const ownLeft = remainingCards(room.state)[team];
        const count = Math.min(ownLeft, 1 + Math.floor(Math.random() * 3));
        room.state = giveClue(room.state, spymaster, pickClueWord(room.state), Math.max(1, count));
      },
    };
  }

  const humanOperativeOnline = members.some((p) => !p.isBot && p.role === 'operative' && p.connected);
  if (humanOperativeOnline) return null; // let the human guess
  const bot = members.find((p) => p.isBot && p.role === 'operative');
  if (!bot) return null;

  return {
    delayMs: rand(2000, 4500),
    run() {
      const s = room.state;
      // On the bonus guess, bots usually play it safe.
      if (s.guessesRemaining <= 1 && chance(0.7)) {
        room.state = endTurn(s, bot);
        return;
      }
      room.state = guess(s, bot, chooseGuess(s, team));
    },
  };
}

const bots = new BotScheduler<Player, GameState>(planBots);

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

/** One pending "turn is up" timer per room. */
const timers = new Map<string, NodeJS.Timeout>();

type CgRoom = Room<Player, GameState>;

/**
 * Keep the server-side clock in step with the state. Both timers are optional,
 * so an untimed game simply never schedules anything.
 */
function syncTimer(room: CgRoom, broadcast: (room: CgRoom) => void): void {
  const existing = timers.get(room.code);
  if (existing) clearTimeout(existing);
  timers.delete(room.code);

  const endsAt = room.state.phase === 'playing' ? room.state.turnEndsAt : null;
  if (endsAt === null) return;

  const delay = Math.max(0, endsAt - Date.now()) + 50;
  timers.set(
    room.code,
    setTimeout(() => {
      timers.delete(room.code);
      const now = Date.now();
      if (isTurnTimeUp(room.state, now)) {
        room.state = turnTimeout(room.state, now);
        broadcast(room);
      }
      syncTimer(room, broadcast); // the next team is now on the clock
    }, delay),
  );
}

export const ciphergridModule: GameModule<Player, GameState> = {
  id: 'ciphergrid',
  maxPlayers: GAME_INFO.ciphergrid.maxPlayers,

  createPlayer: (base) => ({ ...base, team: null, role: null }),
  initialState: emptyGame,
  view: (room, player) => viewFor(room.state, player),

  register(socket, { withRoom, requireHost, broadcast }) {
    socket.on('team:join', ({ team, role }, ack) =>
      withRoom(ack, (room, player) => {
        if (team !== 'red' && team !== 'blue') throw new GameError('Invalid team.');
        if (role !== 'spymaster' && role !== 'operative') throw new GameError('Invalid role.');
        /*
         * Once the game is running, seats are fixed. Previously only the team
         * was locked, so an operative could still promote themselves to
         * spymaster mid-game and see the whole key.
         */
        if (room.state.phase === 'playing') {
          throw new GameError('Teams are locked once the game starts.');
        }
        if (role === 'spymaster') {
          const taken = room.players.find((p) => p.team === team && p.role === 'spymaster' && p.id !== player.id);
          if (taken?.isBot) taken.role = 'operative'; // humans outrank bots
          else if (taken) throw new GameError(`${taken.name} is already the ${team} spymaster.`);
        }
        player.team = team;
        player.role = role;
      }),
    );

    socket.on('team:assign', ({ playerId, team, role }, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase === 'playing') throw new GameError('Teams are locked once the game starts.');

        const target = room.players.find((p) => p.id === String(playerId ?? ''));
        if (!target) throw new GameError('That player is not in this room.');

        // null clears the seat, so the host can bench someone too.
        if (team === null) {
          target.team = null;
          target.role = null;
          return;
        }
        if (team !== 'red' && team !== 'blue') throw new GameError('Invalid team.');
        if (role !== 'spymaster' && role !== 'operative') throw new GameError('Invalid role.');
        if (role === 'spymaster') {
          const taken = room.players.find((p) => p.team === team && p.role === 'spymaster' && p.id !== target.id);
          // The host's choice wins: whoever held the seat becomes an operative.
          if (taken) taken.role = 'operative';
        }
        target.team = team;
        target.role = role;
      }),
    );

    socket.on('game:settings', (patch, ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        room.state = setSettings(room.state, patch ?? {});
      }),
    );

    socket.on('team:randomize', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase === 'playing') throw new GameError('Cannot shuffle teams mid-game.');
        if (room.players.length < 4) throw new GameError('Need at least 4 players to randomize teams.');
        room.players = randomizeTeams(room.players);
      }),
    );

    socket.on('game:start', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        if (room.state.phase === 'playing') throw new GameError('A game is already in progress.');
        fillSeatsWithBots(room);
        const problem = teamsReady(room.players);
        if (problem) throw new GameError(problem);
        room.state = createGame(Math.random, WORDS, room.state.settings, Date.now());
        syncTimer(room, broadcast);
      }),
    );

    socket.on('game:clue', ({ word, count }, ack) =>
      withRoom(ack, (room, player) => {
        room.state = giveClue(room.state, player, String(word ?? ''), Number(count), Date.now());
        syncTimer(room, broadcast);
      }),
    );

    socket.on('game:guess', ({ index }, ack) =>
      withRoom(ack, (room, player) => {
        room.state = guess(room.state, player, Number(index), Date.now());
        syncTimer(room, broadcast);
      }),
    );

    socket.on('game:endTurn', (ack) =>
      withRoom(ack, (room, player) => {
        room.state = endTurn(room.state, player, Date.now());
        syncTimer(room, broadcast);
      }),
    );

    socket.on('game:reset', (ack) =>
      withRoom(ack, (room, player) => {
        requireHost(room, player);
        room.state = { ...emptyGame(), settings: room.state.settings };
        syncTimer(room, broadcast);
      }),
    );
  },

  onBotAdded: seatBot,

  botTick(room, { broadcast }) {
    bots.tick(room, broadcast);
  },

  onRoomClosed(room) {
    bots.cancel(room.code);
    const timer = timers.get(room.code);
    if (timer) clearTimeout(timer);
    timers.delete(room.code);
  },
};
