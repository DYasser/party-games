import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { startsWithLetter } from '@shared/letterrush/categories';
import { MAX_ANSWER_LENGTH, type LetterRushRoomView } from '@shared/letterrush/types';
import type { AppSocket } from '../../lib/socket';
import { formatClock, secondsLeft, useServerClock } from '../../lib/useServerClock';
import type { Act } from '../../lib/useRoom';

interface Props {
  room: LetterRushRoomView;
  act: Act;
  socket: AppSocket;
}

const DEBOUNCE_MS = 350;

export default function LetterRushWriting({ room, act, socket }: Props) {
  const { state, you } = room;
  const round = state.round!;
  const active = round.activeIds.includes(you.id);
  const done = round.doneWriting.includes(you.id);
  const locked = !active || done;
  const doneCount = round.activeIds.filter((id) => round.doneWriting.includes(id)).length;

  const [drafts, setDrafts] = useState<string[]>(() => round.answers[you.id] ?? round.categories.map(() => ''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastSent = useRef<string[]>(round.answers[you.id] ?? round.categories.map(() => ''));

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const send = (i: number, text: string) => {
    if (lastSent.current[i] === text) return Promise.resolve(true);
    lastSent.current[i] = text;
    return act((ack) => socket.emit('letterrush:answer', { categoryIndex: i, text }, ack));
  };

  const onChange = (i: number, text: string) => {
    setDrafts((prev) => {
      const next = prev.slice();
      next[i] = text;
      return next;
    });
    clearTimeout(timers.current[i]);
    timers.current[i] = setTimeout(() => void send(i, text), DEBOUNCE_MS);
  };

  const flushAll = () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    return Promise.all(drafts.map((text, i) => send(i, text)));
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timers.current[i]);
    void send(i, drafts[i]);
    const next = inputs.current[i + 1];
    if (next) next.focus();
    else inputs.current[i]?.blur();
  };

  const finish = async () => {
    await flushAll();
    await act((ack) => socket.emit('letterrush:done', ack));
  };

  return (
    <div className="letterrush-stage">
      <div className="card letterrush-header">
        <div className="letterrush-letter" aria-label={`Letter ${round.letter}`}>
          {round.letter}
        </div>
        <div className="letterrush-header-mid">
          <span className="letterrush-kicker">
            Round {round.number} of {state.settings.rounds}
          </span>
          <strong>Every answer must start with {round.letter}</strong>
          <span className="letterrush-progress">
            {doneCount} of {round.activeIds.length} players done
          </span>
        </div>
        <div className="letterrush-header-right">
          <Countdown endsAt={round.endsAt} serverNow={state.serverNow} />
        </div>
      </div>

      <section className="card">
        {!active && <p className="hint">You joined mid-round. You will be dealt in next round.</p>}
        <div className="letterrush-form">
          {round.categories.map((name, i) => {
            const text = drafts[i] ?? '';
            const invalid = text.trim() !== '' && !startsWithLetter(text, round.letter);
            const filled = text.trim() !== '' && !invalid;
            return (
              <label key={name} className={`letterrush-row ${invalid ? 'invalid' : ''} ${filled ? 'filled' : ''}`}>
                <span className="letterrush-cat">
                  <span className="letterrush-num">{i + 1}</span>
                  {name}
                </span>
                <span className="letterrush-input-wrap">
                  <input
                    ref={(el) => (inputs.current[i] = el)}
                    value={text}
                    onChange={(e) => onChange(i, e.target.value)}
                    onKeyDown={onKeyDown(i)}
                    onBlur={() => {
                      clearTimeout(timers.current[i]);
                      void send(i, text);
                    }}
                    maxLength={MAX_ANSWER_LENGTH}
                    placeholder={`${round.letter}...`}
                    autoFocus={i === 0 && active}
                    disabled={locked}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {invalid && <span className="letterrush-warn">Must start with {round.letter} — this answer will not count.</span>}
                </span>
              </label>
            );
          })}
        </div>
        <div className="letterrush-actions">
          <span className="muted small-text">
            {done ? 'You are done. Waiting for the others or the clock.' : 'Press Enter to jump to the next category.'}
          </span>
          {active && (
            <button className="btn primary" onClick={finish} disabled={done}>
              {done ? 'Done' : "I'm done"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function Countdown({ endsAt, serverNow, label }: { endsAt: number; serverNow: number; label?: string }) {
  const now = useServerClock(serverNow, 250);
  const remaining = Math.max(0, endsAt - now);
  const total = secondsLeft(endsAt, now);
  const urgent = remaining > 0 && remaining <= 10_000;

  return (
    <div className="letterrush-header-mid" style={{ alignItems: 'flex-end' }}>
      {label && <span className="letterrush-kicker">{label}</span>}
      <div className={`countdown ${urgent ? 'urgent' : ''}`} aria-live="off">
        {formatClock(total)}
      </div>
    </div>
  );
}
