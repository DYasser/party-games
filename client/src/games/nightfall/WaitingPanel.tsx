import { ROLE_INFO, type Role } from '@shared/nightfall/types';
import RoleIcon from './RoleIcon';

interface Props {
  /** Roles that still owe a decision tonight, in wake order. */
  pendingRoles: Role[];
  /** The role awake right now. */
  turn: Role | null;
  /** You have a power, but an earlier role is still acting. */
  notYetYourTurn?: boolean;
  /** Your role, so the copy can speak to what you just did. */
  role: Role | null;
  /** Set when you have locked a choice in and are now waiting on others. */
  yourPick?: string | null;
  /** Shown when you have no night action at all. */
  idle?: boolean;
}

const IDLE_LINES: Record<string, string> = {
  townsfolk: 'You sleep soundly, blissfully unaware.',
  none: 'The night moves without you.',
};

const DONE_LINES: Record<Role, string> = {
  shade: 'Your mark is chosen. Wait for the others to move.',
  oracle: 'Your vision is cast. The answer comes at dawn.',
  healer: 'Your ward is set. Hold it until morning.',
  townsfolk: 'Nothing to do but wait for dawn.',
};

/** What each role is busy doing, for the waiting headline. */
const DOING: Record<Role, string> = {
  shade: 'choosing a victim',
  oracle: 'seeking a vision',
  healer: 'setting a ward',
  townsfolk: 'sleeping',
};

/**
 * How a role is named while it acts.
 *
 * Always the role, never a player count. The Shades are one coven deciding
 * together, so they stay "the Shades" whether there is one of them or three —
 * counting them down as they lock in would read as waiting on players rather
 * than roles, and would tell the whole table how many Shades are left.
 */
function nameOfRole(role: Role): string {
  return role === 'shade' ? 'the Shades' : `the ${ROLE_INFO[role].name}`;
}

/** "the Shades" / "the Oracle and the Healer" */
function describeRoles(roles: Role[]): string {
  const parts = roles.map(nameOfRole);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The screen a player sees while somebody else is still deciding. It names the
 * role that is acting, which is public knowledge from the rules, but never who
 * holds it, how many hold it, or whom they are choosing.
 */
export default function WaitingPanel({ pendingRoles, turn, role, yourPick, idle, notYetYourTurn }: Props) {
  const line = notYetYourTurn
    ? 'Your turn is coming. Stay sharp.'
    : idle
      ? (IDLE_LINES[role ?? 'none'] ?? IDLE_LINES.none)
      : role
        ? DONE_LINES[role]
        : IDLE_LINES.none;

  // Whose turn it is drives the headline; the pending list is the fallback.
  const active = turn ?? pendingRoles[0] ?? null;
  const who = active ? nameOfRole(active) : describeRoles(pendingRoles);

  return (
    <div className="nf-waiting">
      <div className="nf-waiting-art" aria-hidden>
        <span className="nf-moon" />
        <span className="nf-zzz z1">z</span>
        <span className="nf-zzz z2">z</span>
        <span className="nf-zzz z3">z</span>
        {/* Show whose turn it is, not who you are. */}
        {active ? (
          <span className="nf-waiting-sigil turn">
            <RoleIcon role={active} />
          </span>
        ) : (
          role &&
          role !== 'townsfolk' &&
          !idle && (
            <span className="nf-waiting-sigil">
              <RoleIcon role={role} />
            </span>
          )
        )}
      </div>

      {active ? (
        <>
          <h3 className="nf-waiting-title">It is {who}&apos;s turn</h3>
          <p className="muted">They are {DOING[active]}.</p>
        </>
      ) : who ? (
        <>
          <h3 className="nf-waiting-title">Waiting on {who}</h3>
          <p className="muted">They are making their choices.</p>
        </>
      ) : (
        <h3 className="nf-waiting-title">The night is closing…</h3>
      )}

      <p className="muted small-text">{line}</p>

      {yourPick && (
        <p className="nf-waiting-pick">
          Locked in: <strong>{yourPick}</strong>
        </p>
      )}

      <div className="nf-waiting-dots" aria-hidden>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
