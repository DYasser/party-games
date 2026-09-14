import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_CLUE_LENGTH, type SpectrumRoomView } from '@shared/spectrum/types';
import type { AppSocket } from '../../lib/socket';
import { formatClock, secondsLeft, useServerClock } from '../../lib/useServerClock';
import type { Act } from '../../lib/useRoom';
import SpectrumBar, { type BarMarker } from './SpectrumBar';

interface Props {
  room: SpectrumRoomView;
  act: Act;
  socket: AppSocket;
}

type Round = NonNullable<SpectrumRoomView['state']['round']>;

export default function SpectrumPlay({ room, act, socket }: Props) {
  const { state, you, players } = room;
  const round = state.round!;
  const psychic = players.find((p) => p.id === round.psychicId);
  const isGuesser = round.guesserIds.includes(you.id);
  const guessers = round.guesserIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const lockedCount = round.guesserIds.filter((id) => round.guesses[id]?.locked).length;

  return (
    <div className="spectrum-grid">
      <section className="spectrum-main">
        {state.phase === 'clue' && (
          <div className="card spectrum-stage">
            <span className="spectrum-kicker">Round {round.number} · The psychic is thinking…</span>
            {round.isPsychic ? (
              <h2 className="spectrum-clue-heading">Give a clue for this exact spot</h2>
            ) : (
              <h2 className="spectrum-clue-heading muted">Waiting for {psychic?.name ?? 'the psychic'} to write a clue</h2>
            )}
            <SpectrumBar
              left={round.spectrum.left}
              right={round.spectrum.right}
              markers={round.target !== null ? [{ id: 'target', value: round.target, label: 'Target', kind: 'target' }] : []}
              bandsAround={round.target}
            />
            {round.target !== null && <BandKey />}
            {round.isPsychic && <ClueForm act={act} socket={socket} />}
            {!round.isPsychic && (
              <p className="muted small-text">
                {isGuesser ? 'Get ready to place your needle.' : 'You joined mid-round. You will be dealt in next round.'}
              </p>
            )}
          </div>
        )}

        {state.phase === 'guessing' && (
          <div className="card spectrum-stage">
            <span className="spectrum-kicker">
              Round {round.number} · {psychic?.name ?? 'The psychic'} says
            </span>
            <div className="spectrum-clue">“{round.clue}”</div>
            <div className="spectrum-clock-row">
              <Countdown endsAt={round.guessEndsAt ?? state.serverNow} serverNow={state.serverNow} />
              <span className="muted small-text">
                {lockedCount}/{round.guesserIds.length} locked in
              </span>
            </div>
            {isGuesser ? (
              <Guesser key={round.number} round={round} you={you} act={act} socket={socket} />
            ) : (
              <>
                <SpectrumBar
                  left={round.spectrum.left}
                  right={round.spectrum.right}
                  markers={round.target !== null ? [{ id: 'target', value: round.target, label: 'Target', kind: 'target' }] : []}
                  bandsAround={round.target}
                />
                {round.target !== null && <BandKey />}
              </>
            )}
            {round.isPsychic && <p className="hint">Sit tight, your friends are placing their needles.</p>}
          </div>
        )}

        {state.phase === 'reveal' && <Reveal room={room} round={round} act={act} socket={socket} />}
      </section>

      <aside className="spectrum-side">
        <section className="card">
          <h3>Guessers</h3>
          <ul className="spectrum-chips">
            {guessers.map((p) => {
              const g = round.guesses[p.id];
              const locked = !!g?.locked;
              return (
                <li key={p.id} className={`spectrum-chip ${locked ? 'locked' : ''} ${p.connected ? '' : 'offline'}`}>
                  <span className="spectrum-chip-name">
                    {p.name}
                    {p.id === you.id && <span className="muted"> (you)</span>}
                  </span>
                  {p.isBot && <span className="tag bot">bot</span>}
                  {!p.connected && <span className="tag">away</span>}
                  <span className={`spectrum-lock ${locked ? 'on' : ''}`}>{locked ? 'Locked' : g ? 'Deciding…' : '…'}</span>
                </li>
              );
            })}
          </ul>
          {psychic && (
            <p className="muted small-text spectrum-psychic-line">
              Psychic this round: <strong>{psychic.name}</strong>
            </p>
          )}
        </section>

        <section className="card">
          <h3>Scores</h3>
          <ul className="score-list">
            {players
              .slice()
              .sort((a, b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0))
              .map((p) => (
                <li key={p.id}>
                  <span>
                    {p.name}
                    {p.id === you.id && <span className="muted"> (you)</span>}
                  </span>
                  <strong>{state.scores[p.id] ?? 0}</strong>
                </li>
              ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClueForm({ act, socket }: { act: Act; socket: AppSocket }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const hasDigit = /\d/.test(text);
  const clean = text.trim();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clean || hasDigit || busy) return;
    setBusy(true);
    await act((ack) => socket.emit('spectrum:clue', { text: clean }, ack));
    setBusy(false);
  };
  return (
    <form className="spectrum-clue-form" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CLUE_LENGTH))}
        maxLength={MAX_CLUE_LENGTH}
        placeholder="A word or two that lands right on the target"
        autoFocus
        autoComplete="off"
      />
      <button className="btn primary" type="submit" disabled={!clean || hasDigit || busy}>
        Send clue
      </button>
      <span className={`small-text ${hasDigit ? 'error-text' : 'muted'}`}>
        {hasDigit ? 'No numbers allowed in a clue.' : `${text.length}/${MAX_CLUE_LENGTH} · only you can see the target`}
      </span>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function Guesser({
  round,
  you,
  act,
  socket,
}: {
  round: Round;
  you: SpectrumRoomView['you'];
  act: Act;
  socket: AppSocket;
}) {
  const mine = round.guesses[you.id];
  const locked = !!mine?.locked;
  const [value, setValue] = useState<number>(mine?.value ?? 50);
  const [busy, setBusy] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A reconnecting tab picks up the guess the server already has.
  useEffect(() => {
    if (mine && mine.value !== null && locked) setValue(mine.value);
  }, [mine, locked]);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  const send = (v: number) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      void act((ack) => socket.emit('spectrum:guess', { value: v }, ack));
    }, 150);
  };

  const onChange = (v: number) => {
    setValue(v);
    send(v);
  };

  const lockIn = async () => {
    if (locked || busy) return;
    setBusy(true);
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    const ok = await act((ack) => socket.emit('spectrum:guess', { value }, ack));
    if (ok) await act((ack) => socket.emit('spectrum:lock', ack));
    setBusy(false);
  };

  const markers: BarMarker[] = locked ? [{ id: you.id, value, label: 'You', kind: 'you' }] : [];

  return (
    <div className={`spectrum-guesser ${locked ? 'locked' : ''}`}>
      <SpectrumBar left={round.spectrum.left} right={round.spectrum.right} markers={markers}>
        {!locked && (
          <input
            className="spectrum-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Your guess"
          />
        )}
      </SpectrumBar>
      <div className="spectrum-guess-row">
        <span className="spectrum-guess-value">
          <span className="muted small-text">Your needle</span>
          <strong>{value}</strong>
        </span>
        {locked ? (
          <span className="spectrum-locked-badge">Locked in · waiting for the others</span>
        ) : (
          <button className="btn primary big" onClick={lockIn} disabled={busy}>
            Lock In
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** What each band colour is worth. The bands themselves are too narrow to label. */
function BandKey() {
  return (
    <div className="spectrum-band-key">
      {[4, 3, 2, 1].map((points) => (
        <span key={points} className="spectrum-band-key-item">
          <span className={`spectrum-band-key-swatch band-${points}`} />+{points}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Reveal({ room, round, act, socket }: { room: SpectrumRoomView; round: Round; act: Act; socket: AppSocket }) {
  const { players, you, state } = room;
  const isHost = room.hostId === you.id;
  const psychic = players.find((p) => p.id === round.psychicId);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'someone';
  const isLast = state.roundsPlayed >= state.settings.rounds;

  const markers: BarMarker[] = [{ id: 'target', value: round.target ?? 0, label: 'Target', kind: 'target' }];
  for (const id of round.guesserIds) {
    const g = round.guesses[id];
    if (!g || g.value === null) continue;
    const player = players.find((p) => p.id === id);
    markers.push({
      id,
      value: g.value,
      label: id === you.id ? 'You' : nameOf(id),
      sub: `+${round.points?.[id] ?? 0}`,
      kind: id === you.id ? 'you' : player?.isBot ? 'bot' : 'guess',
    });
  }

  const rows = round.guesserIds
    .map((id) => ({ id, name: nameOf(id), guess: round.guesses[id]?.value ?? null, pts: round.points?.[id] ?? 0 }))
    .sort((a, b) => b.pts - a.pts);

  return (
    <div className="card spectrum-stage reveal">
      <span className="spectrum-kicker">Round {round.number} · The reveal</span>
      <div className="spectrum-clue small">“{round.clue}”</div>
      <div className="spectrum-target-line">
        The target was <strong>{round.target}</strong>
      </div>
      <SpectrumBar
        left={round.spectrum.left}
        right={round.spectrum.right}
        markers={markers}
        bandsAround={round.target}
        className="revealed"
      />
      <BandKey />

      <div className="spectrum-results">
        <div className="banner spectrum-psychic-banner">
          <strong>
            {psychic?.name ?? 'The psychic'}
            {round.psychicId === you.id && ' (you)'} · +{round.psychicPoints ?? 0}
          </strong>
          <span>Psychic bonus: the average of everyone&apos;s points.</span>
        </div>
        <ul className="score-list spectrum-round-scores">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {r.name}
                {r.id === you.id && <span className="muted"> (you)</span>}
                <span className="muted small-text"> · {r.guess === null ? 'no guess' : `guessed ${r.guess}`}</span>
              </span>
              <strong>+{r.pts}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="spectrum-next-row">
        <RevealCountdown endsAt={round.revealEndsAt} serverNow={state.serverNow} isLast={isLast} />
        {isHost && (
          <button className="btn primary" onClick={() => act((ack) => socket.emit('spectrum:next', ack))}>
            {isLast ? 'Show final scores' : 'Next round'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Server-corrected countdown for the guessing timer. */
function Countdown({ endsAt, serverNow }: { endsAt: number; serverNow: number }) {
  const now = useServerClock(serverNow, 250);
  const remaining = Math.max(0, endsAt - now);
  const total = secondsLeft(endsAt, now);
  const urgent = remaining > 0 && remaining < 15_000;
  const done = remaining === 0;
  return (
    <div className={`countdown spectrum-countdown ${urgent ? 'urgent' : ''} ${done ? 'done' : ''}`} aria-live="off">
      {done ? "TIME'S UP" : formatClock(total)}
    </div>
  );
}

function RevealCountdown({ endsAt, serverNow, isLast }: { endsAt: number | null; serverNow: number; isLast: boolean }) {
  const now = useServerClock(serverNow, 500);
  if (!endsAt) return null;
  const secs = secondsLeft(endsAt, now);
  return (
    <span className="muted small-text">
      {isLast ? 'Final scores' : 'Next round'} in {secs}s
    </span>
  );
}
