import type { ReactNode } from 'react';

/**
 * Home-page game icons. One inline SVG each, drawn on a 120x84 canvas so they
 * all sit at the same optical weight. Colours are literal hex values matching
 * the theme tokens, so the icons render identically wherever they are used
 * (including outside the app, e.g. in the README preview sheet).
 */

const C = {
  red: '#ff4d6d',
  blue: '#3d8bff',
  violet: '#9d6bff',
  cyan: '#38e1ff',
  mint: '#6cf5c2',
  amber: '#f5b544',
  ink: '#0b0d14',
  slate: '#2a3148',
  white: '#f4f1ff',
};

function Frame({ children, tint }: { children: ReactNode; tint: string }) {
  return (
    <svg viewBox="0 0 120 84" className="gi" role="img" aria-hidden style={{ ['--gi-tint' as string]: tint }}>
      {children}
    </svg>
  );
}

/** A person: head plus shoulders, drawn as one shape so they never separate. */
function Figure({
  x,
  y,
  s = 1,
  fill,
  ring,
  rim,
}: {
  x: number;
  y: number;
  s?: number;
  fill: string;
  ring?: string;
  /** Outline colour, for dark silhouettes that would otherwise vanish. */
  rim?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {ring && <circle cx={0} cy={-2} r={17} fill="none" stroke={ring} strokeWidth={2.2} opacity={0.85} />}
      <circle cx={0} cy={-8} r={7.5} fill={fill} stroke={rim} strokeWidth={rim ? 1.4 : 0} />
      <path
        d="M-11.5 14 v-2.5 a11.5 11.5 0 0 1 23 0 V14 z"
        fill={fill}
        stroke={rim}
        strokeWidth={rim ? 1.4 : 0}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Cipher Grid: a slice of the word grid with team agents and the trap card. */
export function CipherGridIcon() {
  const cells = [
    C.red, C.slate, C.blue, C.slate, C.red,
    C.slate, C.blue, 'trap', C.red, C.blue,
    C.blue, C.red, C.slate, C.blue, C.slate,
  ];
  return (
    <Frame tint={C.blue}>
      {cells.map((c, i) => {
        const x = 7 + (i % 5) * 22;
        const y = 13 + Math.floor(i / 5) * 20;
        if (c === 'trap') {
          return (
            <g key={i}>
              <rect x={x} y={y} width={19} height={16} rx={3.5} fill={C.ink} stroke={C.red} strokeWidth={2} />
              <circle cx={x + 9.5} cy={y + 8} r={3} fill={C.red} />
            </g>
          );
        }
        return <rect key={i} x={x} y={y} width={19} height={16} rx={3.5} fill={c} />;
      })}
    </Frame>
  );
}

/** Infiltrator: a huddle of agents with one impostor picked out in red. */
export function InfiltratorIcon() {
  return (
    <Frame tint={C.cyan}>
      <Figure x={24} y={40} s={0.95} fill="#8f9ab8" />
      <Figure x={48} y={34} s={0.95} fill="#b9c4dc" />
      <Figure x={96} y={40} s={0.95} fill="#8f9ab8" />
      <Figure x={72} y={30} s={1.25} fill={C.red} ring={C.red} />
      <circle cx={72} cy={22} r={2.1} fill={C.ink} opacity={0.6} />
      <circle cx={78} cy={22} r={2.1} fill={C.ink} opacity={0.6} />
    </Frame>
  );
}

/** Spectrum: a gradient gauge with the hidden target and a bold needle. */
export function SpectrumIcon() {
  return (
    <Frame tint={C.mint}>
      <defs>
        <linearGradient id="gi-spectrum" x1="0" x2="1">
          <stop offset="0" stopColor={C.blue} />
          <stop offset="0.5" stopColor={C.violet} />
          <stop offset="1" stopColor={C.red} />
        </linearGradient>
      </defs>
      <path d="M12 66 A48 48 0 0 1 108 66" fill="none" stroke="url(#gi-spectrum)" strokeWidth={11} strokeLinecap="round" />
      {/* Target zone on the dial. */}
      <path d="M84 30 A48 48 0 0 1 97 43" fill="none" stroke={C.mint} strokeWidth={13} strokeLinecap="butt" opacity={0.95} />
      <line x1={60} y1={66} x2={88} y2={38} stroke={C.white} strokeWidth={5} strokeLinecap="round" />
      <circle cx={60} cy={66} r={7.5} fill={C.white} />
      <circle cx={60} cy={66} r={3} fill={C.ink} />
    </Frame>
  );
}

/** One Word: two identical hints cancelling, one unique hint surviving. */
export function OneWordIcon() {
  const card = (x: number, y: number, kind: 'dup' | 'keep') => {
    const dup = kind === 'dup';
    const accent = dup ? C.red : C.mint;
    return (
      <g key={`${x}-${y}`}>
        <rect
          x={x}
          y={y}
          width={34}
          height={26}
          rx={5}
          fill={dup ? 'rgba(255,77,109,0.18)' : 'rgba(108,245,194,0.2)'}
          stroke={accent}
          strokeWidth={2}
        />
        <rect x={x + 7} y={y + 8} width={20} height={4} rx={2} fill={accent} />
        <rect x={x + 7} y={y + 16} width={13} height={4} rx={2} fill={accent} opacity={0.6} />
        {dup && <line x1={x + 3} y1={y + 23} x2={x + 31} y2={y + 3} stroke={C.red} strokeWidth={2.6} strokeLinecap="round" />}
      </g>
    );
  };
  return (
    <Frame tint={C.mint}>
      {card(6, 10, 'dup')}
      {card(43, 10, 'keep')}
      {card(80, 10, 'dup')}
      <path d="M60 40 v9" stroke={C.mint} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M55 46 l5 5 l5 -5" fill="none" stroke={C.mint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={44} y={56} width={32} height={22} rx={5} fill={C.white} />
      <text
        x={60}
        y={72}
        textAnchor="middle"
        fontSize={16}
        fontWeight="700"
        fill={C.ink}
        fontFamily="'Chakra Petch', system-ui, sans-serif"
      >
        ?
      </text>
    </Frame>
  );
}

/** Nightfall: a crescent moon over a line of figures, one of them a Shade. */
export function NightfallIcon() {
  return (
    <Frame tint={C.violet}>
      <g>
        <circle cx={102} cy={17} r={12} fill="#f4f1ff" />
        <circle cx={95} cy={13} r={10.5} fill={C.ink} />
      </g>
      <Figure x={20} y={56} s={1} fill="#070810" rim="#5b4a8a" />
      <Figure x={44} y={56} s={1} fill="#070810" rim="#5b4a8a" />
      <Figure x={96} y={56} s={1} fill="#070810" rim="#5b4a8a" />
      <Figure x={68} y={54} s={1.15} fill={C.red} ring={C.red} />
      <circle cx={65} cy={45} r={1.9} fill={C.ink} />
      <circle cx={71} cy={45} r={1.9} fill={C.ink} />
    </Frame>
  );
}

/** Letter Rush: a big letter with category rows racing off to the right. */
export function LetterRushIcon() {
  return (
    <Frame tint={C.red}>
      <text
        x={31}
        y={62}
        textAnchor="middle"
        fontSize={56}
        fontWeight="700"
        fill={C.white}
        fontFamily="'Chakra Petch', system-ui, sans-serif"
      >
        R
      </text>
      {[
        { y: 20, w: 48, o: 1 },
        { y: 34, w: 36, o: 0.8 },
        { y: 48, w: 44, o: 0.6 },
        { y: 62, w: 26, o: 0.4 },
      ].map((l, i) => (
        <rect key={i} x={62} y={l.y} width={l.w} height={8} rx={4} fill={C.red} opacity={l.o} />
      ))}
    </Frame>
  );
}

/** Pair Rush: a matched pair face-up beside cards still face-down. */
export function PairRushIcon() {
  const back = (x: number, y: number, o = 1) => (
    <g key={`${x}-${y}`} opacity={o}>
      <rect x={x} y={y} width={30} height={38} rx={7} fill={C.slate} />
      <rect x={x + 7} y={y + 9} width={16} height={4} rx={2} fill="#4a5472" />
      <rect x={x + 7} y={y + 18} width={16} height={4} rx={2} fill="#4a5472" />
      <rect x={x + 7} y={y + 27} width={16} height={4} rx={2} fill="#4a5472" />
    </g>
  );
  /* The matched pair is lit in the tint; the rest are still hidden. */
  const face = (x: number, y: number) => (
    <g key={`f-${x}-${y}`}>
      <rect x={x} y={y} width={30} height={38} rx={7} fill={C.violet} />
      <circle cx={x + 15} cy={y + 19} r={8.5} fill={C.white} />
      <circle cx={x + 15} cy={y + 19} r={4} fill={C.violet} />
    </g>
  );
  return (
    <Frame tint={C.violet}>
      {face(10, 12)}
      {back(48, 12, 0.85)}
      {back(86, 12, 0.7)}
      {back(10, 60, 0.7)}
      {back(48, 60, 0.85)}
      {face(86, 60)}
    </Frame>
  );
}

/** Bluff Dice: an open die beside a hidden one. */
export function BluffDiceIcon() {
  const pip = (cx: number, cy: number, fill: string, r = 3.6) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />;
  return (
    <Frame tint={C.red}>
      <g transform="rotate(-10 42 44)">
        <rect x={14} y={20} width={48} height={48} rx={10} fill={C.white} />
        {pip(27, 33, C.ink)}
        {pip(38, 44, C.ink)}
        {pip(49, 55, C.ink)}
        {pip(49, 33, C.ink)}
        {pip(27, 55, C.ink)}
      </g>
      <g transform="rotate(12 88 50)">
        <rect x={68} y={30} width={40} height={40} rx={9} fill="#1c2133" stroke={C.red} strokeWidth={2.4} />
        <text
          x={88}
          y={57}
          textAnchor="middle"
          fontSize={22}
          fontWeight="700"
          fill={C.red}
          fontFamily="'Chakra Petch', system-ui, sans-serif"
        >
          ?
        </text>
      </g>
    </Frame>
  );
}

/** Word Race: two rows of feedback tiles, the second closing in. */
export function WordRaceIcon() {
  const rows: string[][] = [
    ['g', 'x', 'y', 'g', 'x'],
    ['g', 'g', 'y', 'x', 'g'],
  ];
  const grey = '#3a4159';
  const fill: Record<string, string> = { g: C.mint, y: C.amber, x: grey };
  return (
    <Frame tint={C.mint}>
      {rows.map((row, r) =>
        row.map((c, i) => (
          <rect
            key={`${r}-${i}`}
            x={10 + i * 20.5}
            y={r === 0 ? 12 : 46}
            width={18}
            height={26}
            rx={4}
            fill={c === 'x' ? grey : fill[c]}
            opacity={r === 0 ? 1 : 0.8}
          />
        )),
      )}
    </Frame>
  );
}
