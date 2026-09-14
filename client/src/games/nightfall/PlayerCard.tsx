import type { Role } from '@shared/nightfall/types';
import RoleIcon from './RoleIcon';

/** What the viewer is doing to this card, which drives the hover effect. */
export type CardIntent = 'none' | 'kill' | 'inspect' | 'heal' | 'vote';

export interface PlayerCardProps {
  name: string;
  /** Revealed role, or null while still face-down. */
  role: Role | null;
  alive: boolean;
  isYou?: boolean;
  isBot?: boolean;
  left?: boolean;
  /** Small line under the name: a vote tally, "you", an oracle result. */
  note?: string;
  /** Set when this card can be acted on; drives the hover animation. */
  intent?: CardIntent;
  selected?: boolean;
  /** Locked in and no longer changeable. */
  locked?: boolean;
  /** Result of an oracle inspection, shown permanently once known. */
  knownShade?: boolean | null;
  /** A fellow Shade, marked so the coven can find each other at a glance. */
  ally?: boolean;
  /**
   * Names of fellow Shades who have chosen this card tonight, so the coven can
   * see where the knives are pointing before committing.
   */
  allyPickedBy?: string[];
  /** True when at least one of those Shades has locked their pick in. */
  allyLocked?: boolean;
  onClick?: () => void;
  /**
   * Marks this card as a reaction target on the end screen, so thrown emoji
   * know where to fly. Also makes the card clickable without an `intent`.
   */
  celebrateAnchor?: string;
  /** End-screen animation. */
  outcome?: 'win' | 'lose' | null;
  /** Stagger for the reveal flip. */
  delayMs?: number;
}

/**
 * One player, drawn as a playing card. Face-down until their role is known to
 * the viewer, then flipped to show the role sigil. When an intent is set the
 * card animates on hover to preview the action: a blade for a kill, an eye for
 * an inspection, a pulse of light for a heal.
 */
export default function PlayerCard({
  name,
  role,
  alive,
  isYou,
  isBot,
  left,
  note,
  intent = 'none',
  selected,
  locked,
  knownShade,
  ally,
  allyPickedBy,
  allyLocked,
  onClick,
  celebrateAnchor,
  outcome,
  delayMs = 0,
}: PlayerCardProps) {
  const actionable = intent !== 'none' && !!onClick && !locked;
  // On the end screen a card is tappable purely to react to that player.
  const reactable = !actionable && !!celebrateAnchor && !!onClick;
  const classes = [
    'nf-card',
    role ? `role-${role}` : 'face-down',
    alive ? '' : 'dead',
    left ? 'left' : '',
    isYou ? 'is-you' : '',
    actionable ? `actionable intent-${intent}` : '',
    selected ? 'selected' : '',
    locked ? 'locked' : '',
    outcome ? `outcome-${outcome}` : '',
    knownShade === true ? 'known-shade' : '',
    knownShade === false ? 'known-clear' : '',
    ally ? 'ally' : '',
    allyPickedBy && allyPickedBy.length > 0 ? 'ally-target' : '',
    reactable ? 'reactable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = `${name}${role ? `, ${role}` : ''}${alive ? '' : ', out'}`;
  const clickable = actionable || reactable;
  const Tag = clickable ? 'button' : 'div';

  return (
    <Tag
      className={classes}
      onClick={clickable ? onClick : undefined}
      aria-label={actionable ? `Choose ${name}` : reactable ? `React to ${name}` : label}
      aria-pressed={actionable ? !!selected : undefined}
      style={{ animationDelay: `${delayMs}ms` }}
      data-celebrate-anchor={celebrateAnchor}
    >
      <span className="nf-card-inner">
        <span className="nf-card-icon">
          <RoleIcon role={role} />
        </span>
        <span className="nf-card-name">
          {name}
          {isYou && <span className="nf-card-you">you</span>}
        </span>
        {role && <span className="nf-card-role">{role}</span>}
        {note && <span className="nf-card-note">{note}</span>}
        {isBot && <span className="tag bot">bot</span>}
      </span>

      {/* Per-role hover flourishes. Purely decorative. */}
      {actionable && intent === 'kill' && (
        <span className="nf-fx nf-fx-kill" aria-hidden>
          <span className="nf-slash" />
          <span className="nf-slash two" />
        </span>
      )}
      {actionable && intent === 'inspect' && (
        <span className="nf-fx nf-fx-inspect" aria-hidden>
          <span className="nf-scan" />
          <span className="nf-eye" />
        </span>
      )}
      {actionable && intent === 'heal' && (
        <span className="nf-fx nf-fx-heal" aria-hidden>
          <span className="nf-halo" />
          <span className="nf-plus" />
          <span className="nf-spark s1" />
          <span className="nf-spark s2" />
          <span className="nf-spark s3" />
        </span>
      )}
      {actionable && intent === 'vote' && (
        <span className="nf-fx nf-fx-vote" aria-hidden>
          <span className="nf-gavel">☝</span>
        </span>
      )}

      {!alive && !left && (
        <span className="nf-card-stamp" aria-hidden>
          OUT
        </span>
      )}
      {left && (
        <span className="nf-card-stamp" aria-hidden>
          LEFT
        </span>
      )}
      {locked && selected && (
        <span className="nf-card-lock" aria-hidden>
          🔒
        </span>
      )}
      {allyPickedBy && allyPickedBy.length > 0 && (
        <span
          className={`nf-ally-mark ${allyLocked ? 'locked' : ''}`}
          title={`${allyPickedBy.join(', ')} ${allyPickedBy.length === 1 ? 'is' : 'are'} targeting ${name}`}
        >
          <svg className="nf-ally-mark-icon" viewBox="0 0 16 16" aria-hidden>
            {/* A target reticle: unambiguous at 12px, unlike a dagger glyph. */}
            <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="8" r="1.6" fill="currentColor" />
          </svg>
          {allyPickedBy.length > 1 && <em>{allyPickedBy.length}</em>}
        </span>
      )}
      {ally && !knownShade && (
        <span className="nf-card-verdict ally" aria-hidden title="Your fellow Shade">
          ALLY
        </span>
      )}
      {knownShade === true && (
        <span className="nf-card-verdict shade" aria-hidden title="Your vision: a Shade">
          SHADE
        </span>
      )}
      {knownShade === false && (
        <span className="nf-card-verdict clear" aria-hidden title="Your vision: not a Shade">
          CLEAR
        </span>
      )}
    </Tag>
  );
}
