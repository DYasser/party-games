import type { Server } from 'socket.io';
import { UserError } from '../../shared/errors.js';
import type { AckFn, ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.js';
import type { BasePlayer, GameId, RoomView } from '../../shared/room.js';
import { isReactionKey } from '../../shared/celebration.js';
import { ReactionLimiter } from './celebration.js';
import { makeBot } from './games/bots.js';
import type { GameContext, GameModule, Sock } from './games/module.js';
import type { AnyRoom, RoomManager } from './rooms.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

interface Session {
  playerId: string;
  roomCode: string;
}

const MAX_NAME = 20;

/**
 * Wires the game-agnostic room events (create/join/leave/rename/bots/disconnect)
 * and hands each game module a context to register its own events.
 */
export function setupSockets(io: IO, rooms: RoomManager, moduleList: GameModule<BasePlayer, unknown>[]): void {
  const modules = new Map<GameId, GameModule<BasePlayer, unknown>>(moduleList.map((m) => [m.id, m]));
  const sessions = new Map<string, Session>(); // socket.id -> session
  const reactions = new ReactionLimiter();

  const moduleFor = (room: AnyRoom) => {
    const mod = modules.get(room.game);
    if (!mod) throw new Error(`No module for game ${room.game}`);
    return mod;
  };

  /** Every seated, connected player gets their own projection of the room. Then bots get a turn to think. */
  function broadcast(room: AnyRoom): void {
    const mod = moduleFor(room);
    for (const [socketId, session] of sessions) {
      if (session.roomCode !== room.code) continue;
      const player = room.players.find((p) => p.id === session.playerId);
      if (!player) continue;
      const view: RoomView = {
        code: room.code,
        game: room.game,
        hostId: room.hostId,
        players: room.players,
        you: player,
        state: mod.view(room, player),
      };
      io.to(socketId).emit('room:state', view);
    }
    mod.botTick?.(room, { broadcast });
  }

  /** Resolve the socket's room and seat, or ack an error. */
  function seatOf(socket: Sock, ack: AckFn | undefined): { room: AnyRoom; player: BasePlayer } | null {
    const session = sessions.get(socket.id);
    const room = session && rooms.get(session.roomCode);
    const player = room?.players.find((p) => p.id === session?.playerId);
    if (!room || !player) {
      ack?.({ ok: false, error: 'You are not in a room.' });
      return null;
    }
    return { room, player };
  }

  /** Run fn, ack the result, broadcast on success. */
  function guarded(room: AnyRoom, ack: AckFn | undefined, fn: () => void): void {
    try {
      fn();
      ack?.({ ok: true, data: undefined });
      broadcast(room);
    } catch (err) {
      if (err instanceof UserError) {
        ack?.({ ok: false, error: err.message });
      } else {
        console.error(err);
        ack?.({ ok: false, error: 'Something went wrong.' });
      }
    }
  }

  const requireHost = (room: AnyRoom, player: BasePlayer) => {
    if (room.hostId !== player.id) throw new UserError('Only the host can do that.');
  };

  function makeContext(mod: GameModule<BasePlayer, unknown>, socket: Sock): GameContext<BasePlayer, unknown> {
    return {
      broadcast,
      requireHost,
      withRoom(ack, fn) {
        const seat = seatOf(socket, ack);
        if (!seat) return;
        if (seat.room.game !== mod.id) {
          ack?.({ ok: false, error: 'This room is playing a different game.' });
          return;
        }
        guarded(seat.room, ack, () => fn(seat.room, seat.player));
      },
    };
  }

  rooms.setListeners({
    onRoomChanged: broadcast,
    onPlayerRemoved(room, playerId) {
      moduleFor(room).onPlayerRemoved?.(room, playerId, { broadcast });
    },
    onRoomClosed(room) {
      moduleFor(room).onRoomClosed?.(room);
      io.to(roomChannel(room.code)).emit('room:closed', { reason: 'Room expired.' });
    },
  });

  io.on('connection', (socket: Sock) => {
    const enter = (room: AnyRoom, player: BasePlayer) => {
      const prev = sessions.get(socket.id);
      if (prev && prev.roomCode !== room.code) {
        socket.leave(roomChannel(prev.roomCode));
        rooms.remove(prev.roomCode, prev.playerId);
      }
      sessions.set(socket.id, { playerId: player.id, roomCode: room.code });
      socket.join(roomChannel(room.code));
      broadcast(room);
    };

    socket.on('room:create', ({ game, name, playerId }, ack) => {
      const mod = modules.get(game);
      if (!mod) return ack({ ok: false, error: 'Unknown game.' });
      const cleanName = sanitizeName(name);
      if (!cleanName || !isValidId(playerId)) return ack({ ok: false, error: 'Please enter a name.' });
      const host = mod.createPlayer({ id: playerId, name: cleanName, connected: true });
      const room = rooms.create(game, host, mod.initialState(), mod.maxPlayers);
      enter(room, host);
      ack({ ok: true, data: { code: room.code } });
    });

    socket.on('room:join', ({ code, name, playerId }, ack) => {
      const cleanName = sanitizeName(name);
      if (!cleanName || !isValidId(playerId)) return ack({ ok: false, error: 'Please enter a name.' });
      const room = rooms.get(String(code ?? ''));
      if (!room) return ack({ ok: false, error: 'Room not found. Check the code and try again.' });
      const mod = moduleFor(room);
      const result = rooms.join(room, mod.createPlayer({ id: playerId, name: cleanName, connected: true }));
      if ('error' in result) return ack({ ok: false, error: result.error });
      const seated = result.players.find((p) => p.id === playerId)!;
      enter(result, seated);
      ack({ ok: true, data: { code: result.code, game: result.game } });
    });

    socket.on('room:leave', () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      sessions.delete(socket.id);
      socket.leave(roomChannel(session.roomCode));
      rooms.remove(session.roomCode, session.playerId);
    });

    socket.on('player:rename', ({ name }, ack?: AckFn) => {
      const seat = seatOf(socket, ack);
      if (!seat) return;
      guarded(seat.room, ack, () => {
        const clean = sanitizeName(name);
        if (!clean) throw new UserError('Name cannot be empty.');
        seat.player.name = clean;
      });
    });

    socket.on('room:addBot', (ack?: AckFn) => {
      const seat = seatOf(socket, ack);
      if (!seat) return;
      guarded(seat.room, ack, () => {
        requireHost(seat.room, seat.player);
        const mod = moduleFor(seat.room);
        const bot = mod.createPlayer(makeBot(seat.room));
        const result = rooms.join(seat.room, bot);
        if ('error' in result) throw new UserError(result.error);
        mod.onBotAdded?.(seat.room, bot);
      });
    });

    socket.on('room:removeBots', (ack?: AckFn) => {
      const seat = seatOf(socket, ack);
      if (!seat) return;
      requireHostOrAck(seat.room, seat.player, ack, () => {
        const bots = seat.room.players.filter((p) => p.isBot);
        for (const bot of bots) rooms.remove(seat.room.code, bot.id); // each removal broadcasts
        ack?.({ ok: true, data: undefined });
        if (bots.length === 0) broadcast(seat.room);
      });
    });

    /**
     * Celebration reactions are cosmetic and transient: they are relayed to the
     * room and never touch game state, so no broadcast of the room view.
     */
    socket.on('celebrate:react', ({ toId, which }, ack?: AckFn) => {
      const seat = seatOf(socket, ack);
      if (!seat) return;
      const { room, player } = seat;
      if (!isReactionKey(which)) return ack?.({ ok: false, error: 'Unknown reaction.' });
      const target = room.players.find((p) => p.id === String(toId ?? ''));
      if (!target) return ack?.({ ok: false, error: 'That player is not here.' });
      // Silently drop throttled throws: an error toast per tap would be worse.
      if (!reactions.allow(player.id)) return ack?.({ ok: true, data: undefined });

      io.to(roomChannel(room.code)).emit('celebrate:reaction', {
        fromId: player.id,
        fromName: player.name,
        toId: target.id,
        which,
        at: Date.now(),
      });
      ack?.({ ok: true, data: undefined });
    });

    socket.on('celebrate:confetti', (ack?: AckFn) => {
      const seat = seatOf(socket, ack);
      if (!seat) return;
      if (!reactions.allow(seat.player.id)) return ack?.({ ok: true, data: undefined });
      io.to(roomChannel(seat.room.code)).emit('celebrate:confetti', {
        fromId: seat.player.id,
        fromName: seat.player.name,
        at: Date.now(),
      });
      ack?.({ ok: true, data: undefined });
    });

    for (const mod of modules.values()) {
      mod.register(socket, makeContext(mod, socket));
    }

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      sessions.delete(socket.id);
      reactions.forget(session.playerId);
      // Same player still connected on another tab: keep them seated.
      const stillConnected = [...sessions.values()].some(
        (s) => s.playerId === session.playerId && s.roomCode === session.roomCode,
      );
      if (!stillConnected) rooms.disconnect(session.roomCode, session.playerId);
    });
  });

  function requireHostOrAck(room: AnyRoom, player: BasePlayer, ack: AckFn | undefined, fn: () => void): void {
    if (room.hostId !== player.id) {
      ack?.({ ok: false, error: 'Only the host can do that.' });
      return;
    }
    fn();
  }
}

function roomChannel(code: string): string {
  return `room:${code}`;
}

function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}
