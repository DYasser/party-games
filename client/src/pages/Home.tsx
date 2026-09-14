import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { GAME_INFO, type GameId } from '@shared/room';
import {
  BluffDiceIcon,
  CipherGridIcon,
  InfiltratorIcon,
  LetterRushIcon,
  NightfallIcon,
  OneWordIcon,
  PairRushIcon,
  SpectrumIcon,
  WordRaceIcon,
} from './GameIcons';

interface Tile {
  id: GameId;
  genre: string;
  tagline: string;
  icon: ReactNode;
}

const TILES: Tile[] = [
  {
    id: 'ciphergrid',
    genre: 'Team word game',
    tagline: 'Two rival spymasters give one-word clues to find their agents in a grid of 25.',
    icon: <CipherGridIcon />,
  },
  {
    id: 'infiltrator',
    genre: 'Social deduction',
    tagline: 'Everyone shares a secret location, except one. Question each other to find them.',
    icon: <InfiltratorIcon />,
  },
  {
    id: 'spectrum',
    genre: 'Party guessing',
    tagline: 'One clue for a hidden spot on a sliding scale. How close can the room land?',
    icon: <SpectrumIcon />,
  },
  {
    id: 'oneword',
    genre: 'Co-op word game',
    tagline: 'Everyone writes one hint, and any hint two people wrote gets cancelled.',
    icon: <OneWordIcon />,
  },
  {
    id: 'nightfall',
    genre: 'Hidden roles',
    tagline: 'Shades strike at night, the Town votes by day. Trust nobody for long.',
    icon: <NightfallIcon />,
  },
  {
    id: 'letterrush',
    genre: 'Fast typing',
    tagline: 'One letter, six categories, one clock. Only unique answers score.',
    icon: <LetterRushIcon />,
  },
  {
    id: 'pairrush',
    genre: 'Memory race',
    tagline: 'Everyone gets the same grid. First to clear every pair wins.',
    icon: <PairRushIcon />,
  },
  {
    id: 'bluffdice',
    genre: 'Bluffing',
    tagline: 'Hidden dice and rising bids, until somebody finally calls Liar.',
    icon: <BluffDiceIcon />,
  },
  {
    id: 'wordrace',
    genre: 'Word puzzle',
    tagline: 'Everyone races on the same five-letter word. Colours shared, letters hidden.',
    icon: <WordRaceIcon />,
  },
];

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <span className="hero-kicker">▶ Press start</span>
        <h1>Pick your game</h1>
        <p>Spin up a room, drop the code in the group chat, and play from any device.</p>
      </section>
      <section className="game-grid">
        {TILES.map((t) => {
          const info = GAME_INFO[t.id];
          const players =
            info.minPlayers === info.maxPlayers
              ? `${info.minPlayers} players`
              : `${info.minPlayers}–${info.maxPlayers} players`;
          return (
            <Link key={t.id} to={`/${t.id}`} className="game-tile">
              <div className={`game-tile-art art-${t.id}`}>{t.icon}</div>
              <div className="game-tile-body">
                <span className="genre">{t.genre}</span>
                <h3>{info.name}</h3>
                <p>{t.tagline}</p>
                <span className="pill">{players}</span>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
