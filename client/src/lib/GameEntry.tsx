import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared/room';
import { getPlayerId, getSavedName, getSocket, request, saveName } from './socket';

interface Props {
  game: GameId;
  title: string;
  blurb: string;
  /** Rules content rendered inside a collapsible "How to play". */
  children?: ReactNode;
}

/** Landing page for a game: enter a name, then create a room or join one by code. */
export default function GameEntry({ game, title, blurb, children }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState(getSavedName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanName = name.trim();

  const create = async () => {
    if (!cleanName) return setError('Enter your name first.');
    setBusy(true);
    setError(null);
    try {
      saveName(cleanName);
      const socket = getSocket();
      const res = await request<{ code: string }>((ack) =>
        socket.emit('room:create', { game, name: cleanName, playerId: getPlayerId() }, ack),
      );
      navigate(`/${game}/${res.code}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!cleanName) return setError('Enter your name first.');
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setError('Enter the 4-letter room code.');
    saveName(cleanName);
    navigate(`/${game}/${c}`);
  };

  return (
    <div className="entry">
      <div className="entry-header">
        <h1>{title}</h1>
        <p>{blurb}</p>
      </div>

      <div className="card entry-card">
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Alex" autoFocus />
        </label>

        <div className="entry-actions">
          <button className="btn primary big" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create a new room'}
          </button>

          <div className="divider">
            <span>or join a room</span>
          </div>

          <form className="join-form" onSubmit={join}>
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="CODE"
              aria-label="Room code"
              autoComplete="off"
            />
            <button className="btn" type="submit" disabled={busy}>
              Join
            </button>
          </form>
        </div>

        {error && <p className="error-text">{error}</p>}
      </div>

      {children && (
        <details className="rules">
          <summary>How to play</summary>
          {children}
        </details>
      )}
    </div>
  );
}
