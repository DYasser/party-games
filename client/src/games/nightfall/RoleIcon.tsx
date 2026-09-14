import type { Role } from '@shared/nightfall/types';

/**
 * Role sigils, drawn as inline SVG on a shared 48x48 canvas so they sit at the
 * same optical weight on a card. Colours come from the role's team.
 */

const C = {
  shade: '#ff4d6d',
  town: '#3d8bff',
  oracle: '#38e1ff',
  healer: '#6cf5c2',
  folk: '#c7d2eb',
  ink: '#0b0d14',
};

function Frame({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <svg viewBox="0 0 48 48" className="nf-role-icon" role="img" aria-hidden style={{ color: tint }}>
      {children}
    </svg>
  );
}

/** Shade: a hooded figure with glowing eyes. */
function ShadeIcon() {
  return (
    <Frame tint={C.shade}>
      {/* Hood: a peak over the brow, flaring into shoulders. */}
      <path
        d="M24 5c-7.5 0-12 6-12 13.5V27l-5 4v12h34V31l-5-4v-8.5C36 11 31.5 5 24 5z"
        fill="#17131d"
        stroke={C.shade}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* The dark of the hood. */}
      <path d="M24 11c-5 0-8 4-8 9v6h16v-6c0-5-3-9-8-9z" fill="#05060a" />
      <circle cx={19.5} cy={21} r={2.3} fill={C.shade} />
      <circle cx={28.5} cy={21} r={2.3} fill={C.shade} />
      <path d="M17 33h14" stroke={C.shade} strokeWidth={1.6} opacity={0.5} strokeLinecap="round" />
    </Frame>
  );
}

/** Oracle: an eye inside a ring, for seeing what others cannot. */
function OracleIcon() {
  return (
    <Frame tint={C.oracle}>
      <circle cx={24} cy={24} r={17} fill="none" stroke={C.oracle} strokeWidth={2} opacity={0.5} />
      <path d="M8 24c5-7 11-10 16-10s11 3 16 10c-5 7-11 10-16 10S13 31 8 24z" fill="#0d2430" stroke={C.oracle} strokeWidth={2} />
      <circle cx={24} cy={24} r={6} fill={C.oracle} opacity={0.25} />
      <circle cx={24} cy={24} r={4} fill={C.oracle} />
      <circle cx={22.5} cy={22.5} r={1.3} fill="#fff" />
    </Frame>
  );
}

/** Healer: a shield with a cross, for protection. */
function HealerIcon() {
  return (
    <Frame tint={C.healer}>
      <path d="M24 5l15 5v14c0 10-6 16-15 19-9-3-15-9-15-19V10l15-5z" fill="#0d2b23" stroke={C.healer} strokeWidth={2} />
      <path d="M24 14v16M16 22h16" stroke={C.healer} strokeWidth={3.6} strokeLinecap="round" />
    </Frame>
  );
}

/** Townsfolk: a plain lantern-bearing villager. */
function TownsfolkIcon() {
  return (
    <Frame tint={C.folk}>
      <circle cx={24} cy={14} r={6.5} fill="#1c2133" stroke={C.folk} strokeWidth={2} />
      <path d="M12 42v-6a12 12 0 0 1 24 0v6z" fill="#1c2133" stroke={C.folk} strokeWidth={2} />
      <circle cx={24} cy={31} r={3} fill="#f5b544" opacity={0.9} />
    </Frame>
  );
}

/** A face-down card back, for a role nobody has revealed yet. */
export function HiddenIcon() {
  return (
    <Frame tint="#5b6480">
      <circle cx={24} cy={24} r={16} fill="none" stroke="#5b6480" strokeWidth={2} strokeDasharray="4 3" opacity={0.7} />
      <text
        x={24}
        y={31}
        textAnchor="middle"
        fontSize={20}
        fontWeight="700"
        fill="#5b6480"
        fontFamily="'Chakra Petch', system-ui, sans-serif"
      >
        ?
      </text>
    </Frame>
  );
}

const ICONS: Record<Role, () => JSX.Element> = {
  shade: ShadeIcon,
  oracle: OracleIcon,
  healer: HealerIcon,
  townsfolk: TownsfolkIcon,
};

export default function RoleIcon({ role }: { role: Role | null | undefined }) {
  if (!role) return <HiddenIcon />;
  const Icon = ICONS[role];
  return <Icon />;
}

export const ROLE_TINT: Record<Role, string> = {
  shade: C.shade,
  oracle: C.oracle,
  healer: C.healer,
  townsfolk: C.folk,
};
