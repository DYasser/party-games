import { useEffect, useMemo, useState } from 'react';
import { ROLE_INFO, TEAM_NAME, type LogEntry, type NightfallRoomView, type Role } from '@shared/nightfall/types';
import type { AppSocket } from '../../lib/socket';
import type { Act } from '../../lib/useRoom';
import { formatClock, secondsLeft, useServerClock } from '../../lib/useServerClock';
import DawnReveal from './DawnReveal';
import PlayerCard, { type CardIntent } from './PlayerCard';
import WaitingPanel from './WaitingPanel';

interface Props {
  room: NightfallRoomView;
  act: Act;
  socket: AppSocket;
}

type Players = NightfallRoomView['players'];

/**
 * Fellow Shades, from the viewer's perspective. The server only sends another
 * living player's role when the viewer is entitled to it, and for a Shade that
 * means their coven — so this is exactly the set they are allowed to see.
 */
function allyIds(state: NightfallRoomView['state'], youId: string): Set<string> {
  if (state.you.role !== 'shade') return new Set();
  return new Set(
    state.participantIds.filter((id) => id !== youId && state.revealedRoles[id] === 'shade'),
  );
}

/** True when the viewer is entitled to see every card: dead, or game over. */
function isSpectating(state: NightfallRoomView['state']): boolean {
  return state.phase === 'ended' || (state.you.participant && !state.you.alive);
}

/**
 * What a card may show this viewer.
 *
 * The server already decides what each player is entitled to know, so the only
 * question here is whether printing it on the board would spoil the game for a
 * living player:
 *
 *  - **Spectators** (dead, or the game has ended) are entitled to everything,
 *    and watching the drama is the whole consolation for being out. Show it all.
 *  - **Living players** see a role on a card only once it is public knowledge,
 *    meaning that player is out. Their own role is on their role card, fellow
 *    Shades carry an ALLY badge, and an Oracle's findings show as a verdict
 *    banner, so nothing a living player has earned is lost.
 */
function publicRole(state: NightfallRoomView['state'], id: string): Role | null {
  const known = state.revealedRoles[id] ?? null;
  if (isSpectating(state)) return known;
  const out = !state.alive[id] && !state.left.includes(id);
  return out ? known : null;
}

export function nameOf(players: Players, id: string | null | undefined): string {
  if (!id) return 'nobody';
  return players.find((p) => p.id === id)?.name ?? 'someone';
}

export default function NightfallPlay({ room, act, socket }: Props) {
  const { state, you, players } = room;
  const isNight = state.phase === 'night';
  const livingIds = state.participantIds.filter((id) => state.alive[id]);
  const spectating = !you.id || !state.you.participant;

  /** Oracle findings, so a card the viewer inspected stays marked from then on. */
  const rosterVerdicts = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const r of state.you.oracleResults) out[r.targetId] = r.isShade;
    return out;
  }, [state.you.oracleResults]);

  const allies = useMemo(() => allyIds(state, you.id), [state, you.id]);

  return (
    <div className="nightfall-grid">
      <section className="nightfall-main">
        <RoleCard room={room} />

        {isNight ? <NightPanel room={room} act={act} socket={socket} /> : <DayPanel room={room} act={act} socket={socket} livingIds={livingIds} />}

        {spectating && <p className="muted small-text">You joined mid-game and are watching. You&apos;ll be dealt in next time.</p>}
        {state.you.participant && !state.you.alive && (
          <p className="hint">You are dead. You can see every role now, so enjoy the show, but keep it to yourself!</p>
        )}

        <EventLog room={room} />
      </section>

      <aside className="nightfall-side">
        <section className="card">
          <h3>The table ({livingIds.length} alive)</h3>
          <div className="nf-card-grid nf-roster">
            {state.participantIds.map((id) => {
              const p = players.find((pl) => pl.id === id);
              return (
                <PlayerCard
                  key={id}
                  name={nameOf(players, id)}
                  role={publicRole(state, id)}
                  alive={!!state.alive[id]}
                  left={state.left.includes(id)}
                  isYou={id === you.id}
                  isBot={p?.isBot}
                  note={p && !p.connected && state.alive[id] ? 'away' : undefined}
                  knownShade={id in rosterVerdicts ? rosterVerdicts[id] : null}
                  ally={allies.has(id)}
                />
              );
            })}
          </div>
        </section>

        {state.you.role === 'oracle' && (
          <section className="card nightfall-oracle">
            <h3>Your visions</h3>
            {state.you.oracleResults.length === 0 ? (
              <p className="muted small-text">Inspect someone tonight and the truth will be revealed at dawn.</p>
            ) : (
              <ul className="nightfall-visions">
                {state.you.oracleResults.map((r) => (
                  <li key={r.night} className={r.isShade ? 'shade' : 'town'}>
                    <span className="muted small-text">Night {r.night}</span>
                    <strong>{nameOf(players, r.targetId)}</strong>
                    <span>{r.isShade ? 'is a Shade' : 'is not a Shade'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function RoleTag({ role }: { role: Role }) {
  return <span className={`tag nightfall-tag ${ROLE_INFO[role].team}`}>{ROLE_INFO[role].name}</span>;
}

function RoleCard({ room }: { room: NightfallRoomView }) {
  const { state, players, you } = room;
  const [hidden, setHidden] = useState(false);
  const role = state.you.role;

  if (!state.you.participant || !role) {
    return (
      <div className="role-card spectator">
        <span className="role-label">Spectating</span>
        <strong>Game in progress</strong>
      </div>
    );
  }

  const info = ROLE_INFO[role];
  const fellowShades =
    role === 'shade'
      ? state.participantIds.filter((id) => id !== you.id && state.revealedRoles[id] === 'shade' && state.alive[id])
      : [];

  return (
    <button
      className={`role-card nightfall-role ${info.team} ${hidden ? 'hidden' : ''} ${state.you.alive ? '' : 'dead'}`}
      onClick={() => setHidden((h) => !h)}
    >
      {hidden ? (
        <>
          <span className="role-label">Tap to reveal</span>
          <strong>Your card is hidden</strong>
        </>
      ) : (
        <>
          <span className="role-label">
            You are {role === 'oracle' ? 'the' : 'a'} · {TEAM_NAME[info.team]}
          </span>
          <strong>{info.name}</strong>
          <span className="role-sub">{info.power}</span>
          {role === 'shade' && (
            <span className="role-sub nightfall-fellows">
              {fellowShades.length === 0 ? 'You hunt alone.' : `Fellow Shades: ${fellowShades.map((id) => nameOf(players, id)).join(', ')}`}
            </span>
          )}
          {!state.you.alive && <span className="role-sub">You are dead.</span>}
        </>
      )}
      <span className="role-hint">tap to {hidden ? 'show' : 'hide'}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function NightPanel({ room, act, socket }: Props) {
  const { state, players } = room;
  const night = state.night!;
  const me = state.you;
  const [choice, setChoice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // A new night clears any leftover selection from the previous one.
  useEffect(() => {
    setChoice(null);
  }, [night.number]);

  const locked = me.nightReady;
  const myTurn = me.yourTurn;
  const nightAllies = allyIds(state, room.you.id);

  /**
   * Where the rest of the coven is pointing. The target is decided by
   * plurality, so seeing this is how Shades agree on a victim.
   */
  const allyTargets = useMemo(() => {
    const out = new Map<string, { names: string[]; locked: boolean }>();
    for (const pick of me.allyPicks) {
      const entry = out.get(pick.targetId) ?? { names: [], locked: false };
      entry.names.push(nameOf(players, pick.shadeId));
      entry.locked = entry.locked || pick.ready;
      out.set(pick.targetId, entry);
    }
    return out;
  }, [me.allyPicks, players]);
  const committed = locked ? me.nightPick : null;
  // Show the server's pick once locked, otherwise whatever is selected here.
  const shown = committed ?? choice ?? me.nightPick;

  const intent: CardIntent = me.role === 'shade' ? 'kill' : me.role === 'oracle' ? 'inspect' : 'heal';
  const verb = me.role === 'shade' ? 'Strike' : me.role === 'oracle' ? 'Inspect' : 'Protect';

  /** Everything the oracle has already learned, so verdicts stay on the cards. */
  const verdicts = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const r of me.oracleResults) out[r.targetId] = r.isShade;
    return out;
  }, [me.oracleResults]);

  const confirm = async () => {
    if (!shown) return;
    setSending(true);
    // Send the pick, then lock it in. Both must land for the night to advance.
    const picked = await act((ack) => socket.emit('nightfall:nightAction', { targetId: shown }, ack));
    if (picked) await act((ack) => socket.emit('nightfall:nightReady', ack));
    setSending(false);
  };

  // No action tonight, not your turn yet, or already locked in: wait.
  if (!me.hasNightAction || locked || !myTurn) {
    return (
      <section className="card nightfall-night-panel">
        <div className="section-head">
          <h3>Night {night.number}</h3>
          <Countdown endsAt={night.endsAt} serverNow={state.serverNow} />
        </div>
        <WaitingPanel
          pendingRoles={night.pendingRoles}
          turn={night.turn}
          role={me.role}
          idle={!me.hasNightAction}
          notYetYourTurn={me.hasNightAction && !locked && !myTurn}
          yourPick={committed ? nameOf(players, committed) : null}
        />
      </section>
    );
  }

  return (
    <section className="card nightfall-night-panel">
      <div className="section-head">
        <h3>Night {night.number}</h3>
        <Countdown endsAt={night.endsAt} serverNow={state.serverNow} />
      </div>

      <p className="muted small-text">
        {me.role === 'shade' && 'Choose tonight’s victim. If the Shades disagree, the most-picked target falls.'}
        {me.role === 'oracle' && 'Choose someone to inspect. At dawn you will learn whether they are a Shade.'}
        {me.role === 'healer' &&
          `Choose someone to protect tonight.${me.lastProtected ? ` You warded ${nameOf(players, me.lastProtected)} last night, so not them again.` : ''}`}
      </p>

      {me.allyPicks.length > 0 && (
        <p className="nf-coven-line">
          <span aria-hidden>🗡</span>{' '}
          {me.allyPicks
            .map((pick) => `${nameOf(players, pick.shadeId)} → ${nameOf(players, pick.targetId)}${pick.ready ? '' : ' (deciding)'}`)
            .join(' · ')}
        </p>
      )}

      <div className="nf-card-grid">
        {me.eligibleTargets.map((id) => (
          <PlayerCard
            key={id}
            name={nameOf(players, id)}
            role={publicRole(state, id)}
            alive
            isYou={id === room.you.id}
            isBot={players.find((p) => p.id === id)?.isBot}
            intent={intent}
            selected={shown === id}
            knownShade={id in verdicts ? verdicts[id] : null}
            ally={nightAllies.has(id)}
            allyPickedBy={allyTargets.get(id)?.names}
            allyLocked={allyTargets.get(id)?.locked}
            onClick={() => setChoice(id)}
          />
        ))}
      </div>

      <div className="nf-confirm-bar">
        {shown ? (
          <>
            <span className="nf-confirm-text">
              {verb} <strong>{nameOf(players, shown)}</strong>?
            </span>
            <button className="btn primary" onClick={confirm} disabled={sending}>
              {sending ? 'Locking in…' : 'Ready'}
            </button>
            <button className="btn ghost" onClick={() => setChoice(null)} disabled={sending}>
              Clear
            </button>
          </>
        ) : (
          <span className="muted small-text">Pick a card, then press Ready. You can change your mind until then.</span>
        )}
        <span className="nf-confirm-count muted small-text">
          {night.pendingRoles.length > 1 ? 'Others are still deciding' : 'You are the last to decide'}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function DayPanel({ room, act, socket, livingIds }: Props & { livingIds: string[] }) {
  const { state, players, you } = room;
  const day = state.day!;
  const last = state.lastNight;
  const myVote = you.id in day.votes ? day.votes[you.id] : undefined;
  const canVote = state.you.participant && state.you.alive;
  const votesIn = livingIds.filter((id) => id in day.votes).length;
  /** Oracle findings persist onto the day cards as well. */
  const dayVerdicts = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const r of state.you.oracleResults) out[r.targetId] = r.isShade;
    return out;
  }, [state.you.oracleResults]);

  const dayAllies = useMemo(() => allyIds(state, you.id), [state, you.id]);

  // Voting is locked for a short discussion window at the start of the day.
  const now = useServerClock(state.serverNow, 200);
  const votesOpen = now >= day.votesOpenAt;
  const lockLeft = secondsLeft(day.votesOpenAt, now);

  /*
   * The dawn reveal plays once per night, whenever the Shades actually struck
   * someone — whether the blow landed or the Healer's ward turned it aside.
   * A night where the Shades chose nobody has no card to show.
   *
   * Keyed by night number so a re-render, a reconnect or a fresh broadcast
   * never replays it, and so the next night still gets its own.
   */
  const [revealedNight, setRevealedNight] = useState<number | null>(null);
  /*
   * On a save the victim stays anonymous: naming them would tell the table who
   * the Healer guarded, which the game deliberately withholds. So a save shows
   * an unnamed card taking the blow, and only a kill shows a name and a role.
   */
  const showReveal = last !== null && (last.killedId !== null || last.saved) && revealedNight !== last.number;
  const skippers = Object.entries(day.votes)
    .filter(([, t]) => t === null)
    .map(([v]) => v);

  return (
    <>
      {showReveal && last && (
        <DawnReveal
          name={last.killedId ? nameOf(players, last.killedId) : null}
          role={last.killedId ? (state.revealedRoles[last.killedId] ?? null) : null}
          saved={last.saved}
          isBot={last.killedId ? players.find((p) => p.id === last.killedId)?.isBot : false}
          isYou={last.killedId === you.id}
          day={day.number}
          onDone={() => setRevealedNight(last.number)}
        />
      )}

      {last && (
        <div className={`banner nightfall-dawn ${last.killedId ? 'red' : 'blue'}`}>
          <strong>Dawn of day {day.number}</strong>
          <span>
            {last.killedId
              ? `${nameOf(players, last.killedId)} was found dead. They were ${articleFor(state.revealedRoles[last.killedId])}.`
              : last.saved
                ? 'A quiet night. The Shades struck, but the Healer was watching.'
                : 'A quiet night. Nobody was harmed.'}
          </span>
        </div>
      )}

      <section className="card nightfall-day-panel">
        <div className="section-head">
          <h3>Who do we banish?</h3>
          <Countdown endsAt={day.endsAt} serverNow={state.serverNow} />
        </div>
        {votesOpen ? (
          <p className="muted small-text">
            Votes are public. {votesIn} of {livingIds.length} living players have voted.
            {canVote && myVote === undefined && ' Cast yours; you can change it until the day ends.'}
          </p>
        ) : (
          <div className="nf-vote-lock">
            <span className="nf-vote-lock-timer">{lockLeft}</span>
            <span>
              <strong>Discuss.</strong> Voting opens in {lockLeft} second{lockLeft === 1 ? '' : 's'}, so nobody can
              railroad the vote before anyone has spoken.
            </span>
          </div>
        )}

        <div className="nf-card-grid nf-day-grid">
          {livingIds.map((id) => {
            const voters = Object.entries(day.votes)
              .filter(([, t]) => t === id)
              .map(([v]) => v);
            const votable = canVote && votesOpen && id !== you.id;
            return (
              <div key={id} className="nf-day-slot">
                <PlayerCard
                  name={nameOf(players, id)}
                  role={publicRole(state, id)}
                  alive
                  isYou={id === you.id}
                  isBot={players.find((p) => p.id === id)?.isBot}
                  intent={votable ? 'vote' : 'none'}
                  selected={myVote === id}
                  knownShade={id in dayVerdicts ? dayVerdicts[id] : null}
                  ally={dayAllies.has(id)}
                  note={voters.length > 0 ? `${voters.length} vote${voters.length === 1 ? '' : 's'}` : undefined}
                  onClick={votable ? () => act((ack) => socket.emit('nightfall:vote', { targetId: id }, ack)) : undefined}
                />
                {voters.length > 0 && (
                  <div className="nightfall-chips">
                    {voters.map((v) => (
                      <span key={v} className="chip">
                        {nameOf(players, v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="nf-skip-row">
          <div className="nightfall-candidate">
            <span className="player-name">
              Skip today{skippers.length > 0 && <span className="nightfall-count">{skippers.length}</span>}
            </span>
            {skippers.length > 0 && (
              <div className="nightfall-chips">
                {skippers.map((v) => (
                  <span key={v} className="chip">
                    {nameOf(players, v)}
                  </span>
                ))}
              </div>
            )}
          </div>
          {canVote && (
            <button
              className={`btn small ${myVote === null ? 'primary' : 'ghost'}`}
              disabled={myVote === null || !votesOpen}
              onClick={() => act((ack) => socket.emit('nightfall:vote', { targetId: null }, ack))}
            >
              {myVote === null ? 'Skipping' : 'Skip'}
            </button>
          )}
        </div>
        {you.id === room.hostId && state.settings.hostCanCallVote && (
          <p className="muted small-text">As host you can end the discussion early with &quot;Call the vote&quot;.</p>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Which phase a log entry belongs to, so the chronicle can group by cycle. */
type LogPhase = { kind: 'night' | 'day'; number: number } | { kind: 'prologue' } | { kind: 'epilogue' };

function phaseOf(e: LogEntry): LogPhase {
  switch (e.kind) {
    case 'night':
    case 'oracle':
      return { kind: 'night', number: e.night };
    case 'banish':
      return { kind: 'day', number: e.day };
    case 'start':
      return { kind: 'prologue' };
    default:
      // 'win' and 'left' belong to whatever was happening around them; the
      // caller keeps them with the group they were logged into.
      return { kind: 'epilogue' };
  }
}

function samePhase(a: LogPhase, b: LogPhase): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'night' || a.kind === 'day') return a.number === (b as typeof a).number;
  return true;
}

function phaseLabel(phase: LogPhase): string | null {
  if (phase.kind === 'night') return `Night ${phase.number}`;
  if (phase.kind === 'day') return `Day ${phase.number}`;
  if (phase.kind === 'prologue') return 'Before the first night';
  return null;
}

export function EventLog({ room }: { room: NightfallRoomView }) {
  const { state, players } = room;

  /*
   * Group the log into night and day blocks so one cycle is visibly separate
   * from the next. Entries without a cycle of their own ('win', 'left') stay
   * with whatever block they were logged into rather than starting a new one.
   */
  const groups: { phase: LogPhase; entries: LogEntry[] }[] = [];
  for (const entry of state.log) {
    const phase = phaseOf(entry);
    const current = groups[groups.length - 1];
    if (current && (phase.kind === 'epilogue' || samePhase(current.phase, phase))) {
      current.entries.push(entry);
    } else {
      groups.push({ phase, entries: [entry] });
    }
  }
  // Newest first, and newest first inside each block.
  groups.reverse();

  return (
    <section className="card nightfall-log">
      <h3>Chronicle</h3>
      {state.log.length === 0 ? (
        <p className="muted small-text">Nothing has happened yet.</p>
      ) : (
        <div className="nightfall-log-groups">
          {groups.map((group, gi) => {
            const label = phaseLabel(group.phase);
            return (
              <div key={groups.length - gi} className={`nightfall-log-group phase-${group.phase.kind}`}>
                {label && (
                  <p className="nightfall-log-heading">
                    <span className="nightfall-log-icon" aria-hidden>
                      {group.phase.kind === 'night' ? '☾' : group.phase.kind === 'day' ? '☀' : '⚑'}
                    </span>
                    {label}
                  </p>
                )}
                <ul>
                  {group.entries
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <li key={group.entries.length - i} className={`nightfall-log-${e.kind}`}>
                        {describeEntry(e, players, state.revealedRoles)}
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function describeEntry(e: LogEntry, players: Players, revealed: Record<string, Role>): string {
  switch (e.kind) {
    case 'start':
      return `The game begins with ${e.playerCount} players. Night falls.`;
    case 'night':
      if (e.killedId) {
        const role = revealed[e.killedId];
        return `Night ${e.night}: ${nameOf(players, e.killedId)} was killed${role ? ` (${ROLE_INFO[role].name})` : ''}.`;
      }
      return e.saved ? `Night ${e.night}: a quiet night. Someone was saved by the Healer.` : `Night ${e.night}: a quiet night.`;
    case 'oracle':
      return `Night ${e.night}: the Oracle saw that ${nameOf(players, e.targetId)} ${e.isShade ? 'IS a Shade' : 'is not a Shade'}.`;
    case 'banish': {
      const votes = Object.entries(e.votes)
        .map(([v, t]) => `${nameOf(players, v)} → ${t === null ? 'skip' : nameOf(players, t)}`)
        .join(', ');
      const tail = votes ? ` Votes: ${votes}.` : '';
      if (e.banishedId) return `Day ${e.day}: ${nameOf(players, e.banishedId)} was banished. They were ${articleFor(e.role ?? undefined)}.${tail}`;
      if (e.reason === 'tie') return `Day ${e.day}: the vote was tied; nobody was banished.${tail}`;
      if (e.reason === 'skip') return `Day ${e.day}: the town chose to skip.${tail}`;
      return `Day ${e.day}: nobody voted; nobody was banished.`;
    }
    case 'left':
      return `${nameOf(players, e.playerId)} left the game and is counted among the dead.`;
    case 'win':
      return e.winner === 'shades' ? 'The Shades have taken the town. The Shades win!' : 'The last Shade is gone. The Town wins!';
  }
}

export function articleFor(role: Role | undefined): string {
  if (!role) return 'unknown';
  if (role === 'oracle') return 'the Oracle';
  if (role === 'healer') return 'the Healer';
  if (role === 'shade') return 'a Shade';
  return 'a Townsfolk';
}

/* ------------------------------------------------------------------ */

export function Countdown({ endsAt, serverNow }: { endsAt: number; serverNow: number }) {
  const now = useServerClock(serverNow, 250);
  const remaining = Math.max(0, endsAt - now);
  const urgent = remaining > 0 && remaining < 15_000;

  return (
    <div className={`countdown nightfall-countdown ${urgent ? 'urgent' : ''}`} aria-live="off">
      {formatClock(secondsLeft(endsAt, now))}
    </div>
  );
}
