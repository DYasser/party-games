interface DieProps {
  face: number;
  size?: 'sm' | 'md' | 'lg';
  /** Wild 1 (mint glow). */
  wild?: boolean;
  /** Counts toward the bid under scrutiny. */
  hit?: boolean;
  /** Face-down back of a die (no pips). */
  hidden?: boolean;
  className?: string;
}

/** A single die drawn with CSS pips. Face-down dice render as a dark blank. */
export default function Die({ face, size = 'md', wild = false, hit = false, hidden = false, className = '' }: DieProps) {
  const classes = ['bluffdice-die', `bluffdice-die-${size}`, hidden ? 'hidden' : `face-${face}`, wild ? 'wild' : '', hit ? 'hit' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} role="img" aria-label={hidden ? 'hidden die' : `die showing ${face}`}>
      {!hidden && Array.from({ length: face }, (_, i) => <i key={i} />)}
    </span>
  );
}
