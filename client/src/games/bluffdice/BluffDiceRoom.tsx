import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Award } from '@shared/awards';
import {
  MAX_DICE_PER_PLAYER,
  MIN_DICE_PER_PLAYER,
  MIN_PLAYERS,
  type BluffDiceRoomView,
  type BluffDiceSettings,
} from '@shared/bluffdice/types';
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';
import Podium, { type PodiumEntry } from '../../lib/Podium';
import { getSavedName, saveName, type AppSocket } from '../../lib/socket';
import { useCelebration } from '../../lib/useCelebration';
import { useConfirm } from '../../lib/useConfirm';
import { useRoom } from '../../lib/useRoom';
import BluffDiceTable from './BluffDiceTable';
import Die from './Die';
import './bluffdice.css';

export default function BluffDiceRoom() {
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();
  const [name, setName] = useState<string | null>(() => getSavedName() || null);

  if (!name) return <NamePrompt onSubmit={setName} />;
  return <RoomInner code={roomCode} name={name} />;
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = value.trim();
    if (!n) return;
    saveName(n);
    onSubmit(n);
  };
  return (
    <form className="card center-card" onSubmit={submit}>
      <h2>What should we call you?</h2>
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={20} placeholder="Your name" autoFocus />
      <button className="btn primary" type="submit">
        Join room
      </button>
    </form>
  );
}

function RoomInner({ code, name }: { code: string; name: string }) {
  const { room, game, status, error, closed, toast, act, socket } = useRoom<BluffDiceRoomView>(code, name);
  const [copied, setCopied] = useState(false);
  const { ask, dialog } = useConfirm();

  if (game && game !== 'bluffdice') return <Navigate to={`/${game}/${code}`} replace />;

  if (closed) {
    return (
      <div className="card center-card">
        <h2>Room closed</h2>
        <p>{closed}</p>
        <Link to="/bluffdice" className="btn">
          Back to Bluff Dice
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card center-card">
        <h2>Couldn&apos;t join {code}</h2>
        <p className="error-text">{error}</p>
        <Link to="/bluffdice" className="btn">
          Back to Bluff Dice
        </Link>
      </div>
    );
  }

  if (!room) return <div className="card center-card muted">Connecting to room {code}…</div>;

  const { you, state, players } = room;
  const isHost = room.hostId === you.id;
  const connected = players.filter((p) => p.connected);
  const canStart = connected.length >= MIN_PLAYERS;
  const current = state.currentPlayerId ? players.find((p) => p.id === state.currentPlayerId) : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const start = () => act((ack) => socket.emit('bluffdice:start', ack));

  return (
    <div className="room bluffdice">
      {dialog}
      <div className="room-bar">
        <div className="room-code">
          <span className="muted">Room</span> <strong>{room.code}</strong>
          <button className="btn small ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
        <div className="room-status">
          {state.phase === 'lobby' && <span className="muted">Lobby · {connected.length} online</span>}
          {state.phase === 'bidding' && (
            <span className={`turn-pill ${current?.id === you.id ? 'spy' : 'blue'}`}>
              Round {state.round} · {current?.id === you.id ? 'Your turn' : `${current?.name ?? 'Someone'}'s turn`}
            </span>
          )}
          {state.phase === 'reveal' && <span className="turn-pill red">Round {state.round} · Reveal</span>}
          {state.phase === 'ended' && <span>Game over</span>}
        </div>
        <div className="room-actions">
          {isHost && state.phase === 'lobby' && (
            <>
              <button
                className="btn small ghost"
                onClick={() => act((ack) => socket.emit('room:addBot', ack))}
                title="Add a computer player to fill a seat"
              >
                + Bot
              </button>
              {players.some((p) => p.isBot) && (
                <button className="btn small ghost" onClick={() => act((ack) => socket.emit('room:removeBots', ack))}>
                  Remove bots
                </button>
              )}
            </>
          )}
          {isHost && state.phase === 'lobby' && (
            <button
              className="btn small primary"
              onClick={start}
              disabled={!canStart}
              title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players`}
            >
              Start game
            </button>
          )}
          {isHost && state.phase === 'reveal' && (
            <button className="btn small" onClick={() => act((ack) => socket.emit('bluffdice:next', ack))}>
              Next
            </button>
          )}
          {isHost && (state.phase === 'bidding' || state.phase === 'reveal') && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (
                  await ask('Abandon this game and return to the lobby?', {
                    title: 'Abandon game?',
                    confirmLabel: 'Abandon',
                  })
                ) {
                  void act((ack) => socket.emit('bluffdice:reset', ack));
                }
              }}
            >
              Reset
            </button>
          )}
          {!isHost && state.phase === 'lobby' && <span className="muted small-text">Waiting for the host to start…</span>}
        </div>
      </div>

      {state.phase === 'lobby' && (
        <Lobby room={room} isHost={isHost} onSettings={(s) => act((ack) => socket.emit('bluffdice:settings', s, ack))} />
      )}

      {(state.phase === 'bidding' || state.phase === 'reveal') && <BluffDiceTable room={room} act={act} socket={socket} />}

      {state.phase === 'ended' && (
        <Results
          room={room}
          isHost={isHost}
          canStart={canStart}
          onPlayAgain={start}
          onLobby={() => act((ack) => socket.emit('bluffdice:reset', ack))}
          socket={socket}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({
  room,
  isHost,
  onSettings,
}: {
  room: BluffDiceRoomView;
  isHost: boolean;
  onSettings: (settings: BluffDiceSettings) => void;
}) {
  const { players, you, state } = room;
  const { dicePerPlayer, onesWild } = state.settings;

  return (
    <div className="bluffdice-lobby">
      <section className="card">
        <h3>Players ({players.length})</h3>
        <ul className="player-list">
          {players.map((p) => (
            <li key={p.id} className={`player-row ${p.connected ? '' : 'offline'}`}>
              <span className="player-name">
                {p.name}
                {p.id === you.id && <span className="muted"> (you)</span>}
              </span>
              {p.isBot && <span className="tag bot">bot</span>}
              {p.id === room.hostId && <span className="tag">host</span>}
              {!p.connected && <span className="tag">away</span>}
            </li>
          ))}
        </ul>
        {players.filter((p) => p.connected).length < MIN_PLAYERS && (
          <p className="hint">You need at least {MIN_PLAYERS} players. Share the room code or add a bot!</p>
        )}
      </section>

      <GameSettings isHost={isHost} summary={`${dicePerPlayer} dice · ones ${onesWild ? 'wild' : 'normal'}`}>
        <NumberField
          label="Dice per player"
          value={dicePerPlayer}
          min={MIN_DICE_PER_PLAYER}
          max={MAX_DICE_PER_PLAYER}
          suffix="dice"
          disabled={!isHost}
          onCommit={(n) => onSettings({ dicePerPlayer: n, onesWild })}
        />

        <label className="settings-toggle settings-row-full">
          <input
            type="checkbox"
            checked={onesWild}
            disabled={!isHost}
            onChange={(e) => onSettings({ dicePerPlayer, onesWild: e.target.checked })}
          />
          <span className="settings-toggle-text">
            <strong>
              <Die face={1} size="sm" wild={onesWild} /> Wild ones
            </strong>
            <span>{onesWild ? 'Ones count as any face.' : 'Ones are just ones.'}</span>
          </span>
        </label>

        <p className="muted small-text settings-row-full">
          Everyone online when the host starts is dealt in. {onesWild ? 'With wild ones you bid on faces 2 to 6.' : 'Bid on any face, 1 to 6.'}
        </p>
      </GameSettings>
    </div>
  );
}

function Results({
  room,
  isHost,
  canStart,
  onPlayAgain,
  onLobby,
  socket,
}: {
  room: BluffDiceRoomView;
  isHost: boolean;
  canStart: boolean;
  onPlayAgain: () => void;
  onLobby: () => void;
  socket: AppSocket;
}) {
  const { state, players, you } = room;
  const winner = state.winnerId;
  // Only mounted on the ended screen, so the celebration channel is always live here.
  const celebration = useCelebration(socket, true);

  // Final placing, best first: the winner, then anyone still holding dice, then
  // the eliminated in reverse knock-out order (mirrors `standings` in shared/bluffdice/logic.ts).
  const order: string[] = [];
  if (winner) order.push(winner);
  for (const id of state.seatOrder) if (id !== winner && (state.players[id]?.diceCount ?? 0) > 0) order.push(id);
  for (let i = state.eliminationOrder.length - 1; i >= 0; i--) order.push(state.eliminationOrder[i]);

  // Nobody has points here, only a finishing position. Score each player by how many
  // rivals they outlasted, so the winner is strictly highest and no two placings tie.
  const total = order.length;
  const entries: PodiumEntry[] = order.map((id, i) => {
    const seat = state.players[id];
    const player = players.find((p) => p.id === id);
    const dice = seat?.diceCount ?? 0;
    return {
      id,
      name: player?.name ?? 'someone',
      score: total - 1 - i,
      isBot: player?.isBot,
      isYou: id === you.id,
      detail: seat?.left ? <>left the game</> : dice > 0 ? <>{dice} dice left</> : <>out · {ordinal(i + 1)} place</>,
    };
  });

  // `eliminationOrder` is first-out-first, so [0] is whoever ran out of dice
  // before anybody else. Only worth a callout when somebody else got out too.
  const extraAwards: Award[] = useMemo(() => {
    const firstOutId = state.eliminationOrder[0];
    if (!firstOutId || state.eliminationOrder.length < 2) return [];
    if (state.players[firstOutId]?.left) return []; // rage-quits do not count
    return [
      {
        key: 'bluffdice-first-out',
        title: 'First Out',
        note: 'Out of dice before anybody else. Somebody had to go first, and they volunteered.',
        playerId: firstOutId,
        emoji: '🎲',
      },
    ];
  }, [state.eliminationOrder, state.players]);

  return (
    <div className="bluffdice-results">
      <div className="card">
        <Podium entries={entries} unit="outlasted" celebration={celebration} extraAwards={extraAwards}>
          <p className="muted small-text">
            {winner
              ? `Last one holding dice after ${state.round} round${state.round === 1 ? '' : 's'}.`
              : 'Nobody is left standing.'}
          </p>
          <div className="podium-actions">
            {isHost ? (
              <>
                <button
                  className="btn primary big"
                  onClick={onPlayAgain}
                  disabled={!canStart}
                  title={canStart ? '' : `Need at least ${MIN_PLAYERS} connected players`}
                >
                  Play again
                </button>
                <button className="btn" onClick={onLobby}>
                  Back to lobby
                </button>
              </>
            ) : (
              <p className="muted small-text">Waiting for the host to start another game…</p>
            )}
          </div>
        </Podium>
      </div>
    </div>
  );
}

/** "1st", "2nd", "3rd", "4th"… for the knock-out order. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = ['st', 'nd', 'rd'][(n % 10) - 1];
  return `${n}${suffix ?? 'th'}`;
}
