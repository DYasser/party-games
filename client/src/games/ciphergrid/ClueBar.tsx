import { useState, type FormEvent } from 'react';
import type { RoomView } from '@shared/ciphergrid/types';
import { UNLIMITED_CLUE } from '@shared/ciphergrid/types';
import type { AppSocket } from '../../lib/socket';
import Select from '../../lib/Select';

interface Props {
  room: RoomView;
  socket: AppSocket;
  act: (emit: (ack: (res: { ok: true; data: undefined } | { ok: false; error: string }) => void) => void) => Promise<boolean>;
}

/** Shows the current clue, or the clue form for the active spymaster. */
export default function ClueBar({ room, socket, act }: Props) {
  const { state, you } = room;
  const [word, setWord] = useState('');
  const [count, setCount] = useState<number>(1);
  const [sending, setSending] = useState(false);

  const myTurn = state.phase === 'playing' && you.team === state.turn;
  const iAmSpymaster = you.role === 'spymaster';
  const iAmOperative = you.role === 'operative';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    const ok = await act((ack) => socket.emit('game:clue', { word, count }, ack));
    setSending(false);
    if (ok) setWord('');
  };

  if (state.phase === 'ended') return null;

  if (state.currentClue) {
    const c = state.currentClue;
    const guesses = state.guessesRemaining;
    return (
      <div className={`clue-bar ${c.team}`}>
        <div className="clue-display">
          <span className="clue-word">{c.word}</span>
          <span className="clue-count">{c.count === UNLIMITED_CLUE ? '∞' : c.count}</span>
        </div>
        <div className="clue-meta">
          {guesses === UNLIMITED_CLUE ? 'Unlimited guesses' : `${guesses} guess${guesses === 1 ? '' : 'es'} left`}
        </div>
        {myTurn && iAmOperative && (
          <button className="btn small" onClick={() => act((ack) => socket.emit('game:endTurn', ack))}>
            End turn
          </button>
        )}
      </div>
    );
  }

  if (myTurn && iAmSpymaster) {
    return (
      <form className={`clue-bar form ${state.turn}`} onSubmit={submit}>
        <input
          className="clue-input"
          value={word}
          onChange={(e) => setWord(e.target.value.replace(/\s/g, ''))}
          placeholder="One-word clue"
          maxLength={30}
          autoFocus
          required
        />
        <Select
          className="clue-select"
          compact
          label="Number of words this clue points to"
          value={count}
          onChange={setCount}
          options={[
            ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: n, label: String(n) })),
            { value: UNLIMITED_CLUE, label: '∞' },
          ]}
        />
        <button className="btn primary" type="submit" disabled={sending || !word.trim()}>
          Give clue
        </button>
      </form>
    );
  }

  return (
    <div className={`clue-bar waiting ${state.turn}`}>
      {myTurn
        ? 'Waiting for your spymaster to give a clue…'
        : `Waiting for the ${state.turn} spymaster to give a clue…`}
    </div>
  );
}
