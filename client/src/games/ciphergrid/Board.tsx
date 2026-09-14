import type { CardView } from '@shared/ciphergrid/types';

interface Props {
  cards: CardView[];
  canGuess: boolean;
  isSpymaster: boolean;
  ended: boolean;
  onGuess: (index: number) => void;
}

export default function Board({ cards, canGuess, isSpymaster, ended, onGuess }: Props) {
  return (
    <div className={`board ${isSpymaster ? 'spymaster' : ''}`} role="grid" aria-label="Cipher Grid board">
      {cards.map((card, i) => {
        const classes = ['word-card'];
        if (card.revealed) classes.push('revealed', card.type ?? '');
        else if (card.type) classes.push('key', card.type); // spymaster / ended view
        if (canGuess && !card.revealed) classes.push('clickable');
        const disabled = !canGuess || card.revealed || ended;
        return (
          <button
            key={`${card.word}-${i}`}
            className={classes.join(' ')}
            disabled={disabled}
            onClick={() => onGuess(i)}
            aria-label={card.revealed ? `${card.word}, revealed ${card.type}` : card.word}
          >
            <span className="word">{card.word}</span>
          </button>
        );
      })}
    </div>
  );
}
