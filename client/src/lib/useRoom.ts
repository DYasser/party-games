import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameId, RoomView } from '@shared/room';
import { getPlayerId, getSocket, request } from './socket';

export type JoinStatus = 'idle' | 'joining' | 'joined' | 'error';

type AckRes = { ok: true; data: undefined } | { ok: false; error: string };
export type Act = (emit: (ack: (res: AckRes) => void) => void) => Promise<boolean>;

/**
 * Keeps a live view of a room. Auto-joins with the given name and rejoins after
 * reconnects so a refreshed tab lands back in the same seat.
 */
export function useRoom<V extends RoomView = RoomView>(code: string, name: string | null) {
  const [room, setRoom] = useState<V | null>(null);
  const [game, setGame] = useState<GameId | null>(null);
  const [status, setStatus] = useState<JoinStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (!name) return;
    const socket = getSocket();
    let cancelled = false;

    const join = async () => {
      setStatus('joining');
      try {
        const res = await request<{ code: string; game: GameId }>((ack) =>
          socket.emit('room:join', { code, name: nameRef.current ?? '', playerId: getPlayerId() }, ack),
        );
        if (!cancelled) {
          setGame(res.game);
          setStatus('joined');
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    };

    const onState = (view: RoomView) => {
      if (view.code === code) {
        setRoom(view as V);
        setGame(view.game);
      }
    };
    const onClosed = ({ reason }: { reason: string }) => setClosed(reason);
    const onError = ({ message }: { message: string }) => setToast(message);

    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('error', onError);
    socket.on('connect', join);
    if (socket.connected) void join();

    return () => {
      cancelled = true;
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('error', onError);
      socket.off('connect', join);
      socket.emit('room:leave');
    };
  }, [code, name]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /** Fire an ack-style action and surface any server error as a toast. */
  const act = useCallback<Act>(async (emit) => {
    try {
      await request(emit);
      return true;
    } catch (err) {
      setToast((err as Error).message);
      return false;
    }
  }, []);

  return { room, game, status, error, closed, toast, act, socket: getSocket() };
}
