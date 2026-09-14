import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  REACTION_TTL_MS,
  type ConfettiEvent,
  type ReactionEvent,
  type ReactionKey,
} from '@shared/celebration';
import type { AppSocket } from './socket';

/** One reaction currently animating on screen. */
export interface FlyingReaction extends ReactionEvent {
  /** Unique per throw, so React keys stay stable. */
  uid: string;
  /** Randomised so simultaneous throws do not overlap exactly. */
  offset: number;
  drift: number;
}

export interface CelebrationState {
  /** Reactions in flight, oldest first. */
  flying: FlyingReaction[];
  /** Running tally per player: { playerId: { clap: 3, fire: 1 } }. */
  tally: Record<string, Partial<Record<ReactionKey, number>>>;
  /** Total reactions received, per player, for quick sorting. */
  totals: Record<string, number>;
  /** Bumps each time somebody fires the cannon, to retrigger the animation. */
  confetti: { at: number; fromName: string } | null;
  react: (toId: string, which: ReactionKey) => void;
  fireConfetti: () => void;
}

let uidCounter = 0;

/**
 * Subscribes to the room's celebration channel: reactions other players throw,
 * and confetti anyone fires. Everything here is transient and lives only in
 * client memory, so a refresh simply clears it.
 */
export function useCelebration(socket: AppSocket, enabled: boolean): CelebrationState {
  const [flying, setFlying] = useState<FlyingReaction[]>([]);
  const [tally, setTally] = useState<CelebrationState['tally']>({});
  const [confetti, setConfetti] = useState<CelebrationState['confetti']>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current =
      typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onReaction = (event: ReactionEvent) => {
      // Ignore anything stale enough that its animation would already be over.
      if (Date.now() - event.at > REACTION_TTL_MS) return;

      setTally((prev) => {
        const forPlayer = { ...(prev[event.toId] ?? {}) };
        forPlayer[event.which] = (forPlayer[event.which] ?? 0) + 1;
        return { ...prev, [event.toId]: forPlayer };
      });

      if (reducedMotion.current) return; // tally still updates, nothing flies
      const uid = `r${uidCounter++}`;
      setFlying((prev) => [
        ...prev.slice(-24), // cap concurrent animations
        { ...event, uid, offset: Math.random() * 60 - 30, drift: Math.random() * 40 - 20 },
      ]);
      window.setTimeout(() => {
        setFlying((prev) => prev.filter((f) => f.uid !== uid));
      }, REACTION_TTL_MS);
    };

    const onConfetti = (event: ConfettiEvent) => {
      setConfetti({ at: event.at, fromName: event.fromName });
    };

    socket.on('celebrate:reaction', onReaction);
    socket.on('celebrate:confetti', onConfetti);
    return () => {
      socket.off('celebrate:reaction', onReaction);
      socket.off('celebrate:confetti', onConfetti);
    };
  }, [socket, enabled]);

  // Leaving the results screen clears the party.
  useEffect(() => {
    if (enabled) return;
    setFlying([]);
    setTally({});
    setConfetti(null);
  }, [enabled]);

  const react = useCallback(
    (toId: string, which: ReactionKey) => {
      socket.emit('celebrate:react', { toId, which });
    },
    [socket],
  );

  const fireConfetti = useCallback(() => {
    socket.emit('celebrate:confetti');
  }, [socket]);

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [playerId, counts] of Object.entries(tally)) {
      out[playerId] = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    }
    return out;
  }, [tally]);

  return { flying, tally, totals, confetti, react, fireConfetti };
}
