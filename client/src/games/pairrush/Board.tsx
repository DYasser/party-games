import type { CardView } from '@shared/pairrush/types';

interface Props {
  cards: CardView[];
  size: number;
  /** False while a mismatch is still showing, or once you have finished. */
  canFlip: boolean;
  onFlip: (index: number) => void;
}

/**
 * Your own board.
 *
 * A card's symbol only exists in the view once the server decides you may see
 * it, so a face-down card genuinely holds nothing to inspect — there is no
 * hidden text in the DOM for anyone to read.
 */
export default function Board({ cards, size, canFlip, onFlip }: Props) {
  return (
    <div
      className="pr-board"
      style={{ '--pr-size': size } as React.CSSProperties}
      role="grid"
      aria-label="Your memory board"
    >
      {cards.map((card, i) => {
        const faceUp = card.matched || card.flipped;
        return (
          <button
            key={i}
            className={`pr-card ${faceUp ? 'up' : ''} ${card.matched ? 'matched' : ''}`}
            onClick={() => onFlip(i)}
            disabled={!canFlip || faceUp}
            aria-label={faceUp && card.symbol ? `Card ${i + 1}, ${card.symbol}` : `Card ${i + 1}, face down`}
          >
            <span className="pr-card-inner">
              <span className="pr-face pr-back" aria-hidden />
              <span className="pr-face pr-front">
                <span className="pr-symbol">{card.symbol}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
