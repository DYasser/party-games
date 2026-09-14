import { useState, type FormEvent } from 'react';
import type { HintView, OneWordRoomView } from '@shared/oneword/types';
import type { AppSocket } from '../../lib/socket';
import { useConfirm } from '../../lib/useConfirm';
import { secondsLeft, useServerClock } from '../../lib/useServerClock';
import type { Act } from '../../lib/useRoom';
import { DeckDots } from './OneWordRoom';

interface Props {
  room: OneWordRoomView;
  act: Act;
  socket: AppSocket;
}

export default function OneWordPlay({ room, act, socket }: Props) {
  const { state, you, players } = room;
  const card = state.card!;
  const isGuesser = card.guesserId === you.id;
  const isHinter = card.hinterIds.includes(you.id);
  const guesserName = nameOf(players, card.guesserId);
  const cardNumber = state.outcomes.filter((o) => o !== null).length + (card.outcome === null ? 1 : 0);

  return (
    <div className="oneword-play">
      <div className="card oneword-header">
        <div className="oneword-header-row">
          <div>
            <h2 className="oneword-title">
              Card {cardNumber} of {state.deckSize} <span className="muted">·</span> Score {state.score}
            </h2>
            <p className="muted small-text oneword-guesser-line">
              {isGuesser ? 'You are guessing' : `${guesserName} is guessing`}
              {!isGuesser && !isHinter && ' · you joined mid-deck and will be dealt in next game'}
            </p>
          </div>
          <PhaseClock endsAt={state.phaseEndsAt} serverNow={state.serverNow} phase={state.phase} />
        </div>
        <DeckDots outcomes={state.outcomes} current={card.index} />
      </div>

      {state.phase === 'result' ? (
        <ResultView room={room} />
      ) : isGuesser ? (
        <GuesserView room={room} act={act} socket={socket} />
      ) : (
        <HinterView room={room} act={act} socket={socket} canAct={isHinter} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hinter                                                              */
/* ------------------------------------------------------------------ */

function HinterView({ room, act, socket, canAct }: Props & { canAct: boolean }) {
  const { state, you, players } = room;
  const card = state.card!;
  const [draft, setDraft] = useState(card.yourHint ?? '');
  const [cardKey, setCardKey] = useState(card.index);
  if (cardKey !== card.index) {
    setCardKey(card.index);
    setDraft('');
  }

  const submitHint = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void act((ack) => socket.emit('oneword:hint', { text }, ack));
  };

  const hintersOnline = card.hinterIds.filter((id) => players.find((p) => p.id === id)?.connected);
  const readyCount = card.ready.length;
  const youReady = card.ready.includes(you.id);

  return (
    <div className="oneword-grid">
      <section className="oneword-main">
        <div className="oneword-word-card">
          <span className="oneword-word-label">The secret word</span>
          <strong className="oneword-word">{card.word}</strong>
          <span className="oneword-word-sub">Don&apos;t say it out loud. {nameOf(players, card.guesserId)} can&apos;t see this.</span>
        </div>

        {state.phase === 'hinting' && canAct && (
          <form className="card oneword-hint-form" onSubmit={submitHint}>
            <label className="field">
              <span>Your one-word hint</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={20}
                placeholder="one word, no spaces"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className="oneword-form-row">
              <button className="btn primary" type="submit" disabled={!draft.trim()}>
                {card.yourHint ? 'Change hint' : 'Submit hint'}
              </button>
              {card.yourHint && (
                <span className="muted small-text">
                  Submitted: <strong>{card.yourHint}</strong>. You can change it until everyone is in.
                </span>
              )}
            </div>
            <p className="muted small-text">
              Not the word itself, nothing containing it, nothing it contains. If someone else writes the same hint, both are
              cancelled.
            </p>
          </form>
        )}

        {state.phase === 'hinting' && !canAct && (
          <div className="card">
            <p className="muted">Hints are being written. You&apos;ll join the deck next game.</p>
          </div>
        )}

        {(state.phase === 'review' || state.phase === 'guessing') && (
          <div className="card">
            <div className="section-head">
              <h3>{state.phase === 'review' ? 'Review the hints' : 'Hints shown to the guesser'}</h3>
              {state.phase === 'review' && (
                <span className="muted small-text">
                  {readyCount} / {hintersOnline.length} ready
                </span>
              )}
            </div>
            {state.phase === 'review' && (
              <p className="muted small-text">
                Duplicates are already struck. Tap any other hint to cancel it if it breaks the rules or gives too much away.
              </p>
            )}
            <HintCards
              hints={card.hints ?? []}
              players={players}
              onToggle={
                state.phase === 'review' && canAct
                  ? (h) => void act((ack) => socket.emit('oneword:cancel', { playerId: h.playerId }, ack))
                  : undefined
              }
              showCancelled
            />
            {(card.hints ?? []).length === 0 && <p className="hint">Nobody managed a hint. The guesser will have to pass.</p>}
            {state.phase === 'review' && canAct && (
              <div className="oneword-form-row">
                <button className={`btn ${youReady ? '' : 'primary'}`} onClick={() => act((ack) => socket.emit('oneword:ready', ack))} disabled={youReady}>
                  {youReady ? 'Waiting for the others…' : 'Show hints to guesser'}
                </button>
              </div>
            )}
            {state.phase === 'guessing' && (
              <p className="muted small-text">
                {nameOf(players, card.guesserId)} is thinking… only the {card.hints?.filter((h) => !h.cancelled).length ?? 0} surviving hints are
                visible to them.
              </p>
            )}
          </div>
        )}
      </section>

      <aside className="oneword-side">
        <section className="card">
          <h3>Hinters</h3>
          <ul className="player-list">
            {card.hinterIds.map((id) => {
              const p = players.find((x) => x.id === id);
              const submitted = card.submittedIds.includes(id);
              const ready = card.ready.includes(id);
              return (
                <li key={id} className={`player-row ${p?.connected === false ? 'offline' : ''}`}>
                  <span className="player-name">
                    {p?.name ?? 'someone'}
                    {id === you.id && <span className="muted"> (you)</span>}
                  </span>
                  {p?.isBot && <span className="tag bot">bot</span>}
                  {p?.connected === false && <span className="tag">away</span>}
                  {state.phase === 'hinting' && <span className={`tag ${submitted ? 'oneword-ok' : ''}`}>{submitted ? 'hint in' : 'thinking'}</span>}
                  {state.phase === 'review' && <span className={`tag ${ready ? 'oneword-ok' : ''}`}>{ready ? 'ready' : 'reviewing'}</span>}
                </li>
              );
            })}
          </ul>
          <p className="muted small-text oneword-guesser-note">
            Guesser: <strong>{nameOf(players, card.guesserId)}</strong>
          </p>
        </section>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guesser                                                             */
/* ------------------------------------------------------------------ */

function GuesserView({ room, act, socket }: Props) {
  const { state, players } = room;
  const card = state.card!;
  const [guess, setGuess] = useState('');
  const { ask, dialog } = useConfirm();
  const waiting = state.phase !== 'guessing';
  const hints = card.hints ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = guess.trim();
    if (!text) return;
    void act((ack) => socket.emit('oneword:guess', { text }, ack));
  };

  return (
    <div className="oneword-guesser">
      {dialog}
      {waiting ? (
        <div className="card oneword-waiting">
          <h2>You&apos;re guessing!</h2>
          <p className="muted">
            {state.phase === 'hinting'
              ? `Wait for the hints… ${card.submittedIds.length} of ${card.hinterIds.length} are in.`
              : 'The hinters are checking their hints for duplicates…'}
          </p>
          <div className="oneword-pulse" aria-hidden />
        </div>
      ) : (
        <>
          <div className="card oneword-hints-stage">
            <h3 className="muted small-text oneword-stage-label">
              {hints.length === 0 ? 'No hints survived' : `${hints.length} hint${hints.length === 1 ? '' : 's'} for you`}
            </h3>
            <HintCards hints={hints} players={players} big showCancelled={false} />
            {hints.length === 0 && <p className="hint">Every hint was cancelled. You can still guess, or pass to save the next card.</p>}
          </div>
          <form className="card oneword-guess-form" onSubmit={submit}>
            <label className="field">
              <span>Your guess</span>
              <input value={guess} onChange={(e) => setGuess(e.target.value)} maxLength={40} placeholder="the secret word" autoComplete="off" autoFocus />
            </label>
            <div className="oneword-form-row">
              <button className="btn primary big" type="submit" disabled={!guess.trim()}>
                Guess
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={async () => {
                  if (
                    await ask('Pass on this card? It is lost, but the next card is safe.', {
                      title: 'Pass on this card?',
                      confirmLabel: 'Pass',
                      danger: false,
                    })
                  ) {
                    void act((ack) => socket.emit('oneword:pass', ack));
                  }
                }}
              >
                Pass
              </button>
            </div>
            <p className="muted small-text">A wrong guess also burns the next card in the deck. Passing only costs this one.</p>
          </form>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

function ResultView({ room }: { room: OneWordRoomView }) {
  const { state, players, you } = room;
  const card = state.card!;
  const guesser = nameOf(players, card.guesserId);
  const outcome = card.outcome ?? 'pass';
  const banner = {
    success: { cls: 'oneword-success', title: 'Got it!', text: `${guesser} guessed "${card.guess}". +1 for the team.` },
    fail: { cls: 'oneword-fail', title: 'Wrong', text: `${guesser} guessed "${card.guess}". This card and the next one are lost.` },
    pass: { cls: 'oneword-pass', title: 'Passed', text: `${guesser} passed. Only this card is lost.` },
    discarded: { cls: 'oneword-pass', title: 'Discarded', text: `${guesser} left, so this card was thrown away.` },
  }[outcome];

  return (
    <div className="oneword-result">
      <div className={`banner ${banner.cls}`}>
        <strong>{banner.title}</strong>
        <span>{banner.text}</span>
      </div>
      <div className="card oneword-reveal">
        <span className="oneword-word-label">The word was</span>
        <strong className="oneword-word">{card.word}</strong>
        <HintCards hints={card.hints ?? []} players={players} showCancelled />
        {(card.hints ?? []).length === 0 && <p className="muted small-text">No hints were written.</p>}
        <p className="muted small-text">
          {you.id === room.hostId ? 'Next card in a moment, or press Next card.' : 'Next card in a moment…'}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function HintCards({
  hints,
  players,
  onToggle,
  big,
  showCancelled,
}: {
  hints: HintView[];
  players: OneWordRoomView['players'];
  onToggle?: (h: HintView) => void;
  big?: boolean;
  showCancelled: boolean;
}) {
  const visible = showCancelled ? hints : hints.filter((h) => !h.cancelled);
  if (visible.length === 0) return null;
  return (
    <div className={`oneword-hints ${big ? 'big' : ''}`}>
      {visible.map((h) => {
        const Tag = onToggle && !h.duplicate ? 'button' : 'div';
        return (
          <Tag
            key={h.playerId}
            type={Tag === 'button' ? 'button' : undefined}
            className={`oneword-hint ${h.cancelled ? 'cancelled' : ''} ${h.duplicate ? 'duplicate' : ''} ${onToggle && !h.duplicate ? 'clickable' : ''}`}
            onClick={onToggle && !h.duplicate ? () => onToggle(h) : undefined}
            title={onToggle && !h.duplicate ? (h.cancelled ? 'Restore this hint' : 'Cancel this hint') : undefined}
          >
            <span className="oneword-hint-text">{h.text}</span>
            <span className="oneword-hint-by">
              {nameOf(players, h.playerId)}
              {h.duplicate && <span className="tag oneword-dup">duplicate</span>}
              {h.cancelled && !h.duplicate && <span className="tag oneword-dup">cancelled</span>}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

function PhaseClock({ endsAt, serverNow, phase }: { endsAt: number | null; serverNow: number; phase: string }) {
  const now = useServerClock(serverNow, 250);
  if (endsAt === null) return null;
  const secs = secondsLeft(endsAt, now);
  const label = { hinting: 'hints', review: 'review', guessing: 'guess', result: 'next' }[phase] ?? '';
  return (
    <div className={`countdown oneword-clock ${secs <= 10 && phase !== 'result' ? 'urgent' : ''}`}>
      {secs}s <span className="oneword-clock-label">{label}</span>
    </div>
  );
}

function nameOf(players: OneWordRoomView['players'], id: string): string {
  return players.find((p) => p.id === id)?.name ?? 'someone';
}
