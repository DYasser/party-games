import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/** Lazily-created singleton socket. Same origin; Vite proxies /socket.io in dev. */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

const PLAYER_ID_KEY = 'pg:playerId';
const NAME_KEY = 'pg:name';

export function getPlayerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

/** Promise wrapper around an ack-style emit. Rejects with the server's error message. */
export function request<T = undefined>(
  emit: (ack: (res: Ack<T>) => void) => void,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server did not respond.')), timeoutMs);
    emit((res) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}
