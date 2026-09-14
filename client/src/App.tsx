import { Link, Route, Routes } from 'react-router-dom';
import BluffDiceEntry from './games/bluffdice/BluffDiceEntry';
import BluffDiceRoom from './games/bluffdice/BluffDiceRoom';
import CipherGridEntry from './games/ciphergrid/CipherGridEntry';
import CipherGridRoom from './games/ciphergrid/CipherGridRoom';
import InfiltratorEntry from './games/infiltrator/InfiltratorEntry';
import InfiltratorRoom from './games/infiltrator/InfiltratorRoom';
import LetterRushEntry from './games/letterrush/LetterRushEntry';
import LetterRushRoom from './games/letterrush/LetterRushRoom';
import NightfallEntry from './games/nightfall/NightfallEntry';
import NightfallRoom from './games/nightfall/NightfallRoom';
import OneWordEntry from './games/oneword/OneWordEntry';
import OneWordRoom from './games/oneword/OneWordRoom';
import PairRushEntry from './games/pairrush/PairRushEntry';
import PairRushRoom from './games/pairrush/PairRushRoom';
import SpectrumEntry from './games/spectrum/SpectrumEntry';
import SpectrumRoom from './games/spectrum/SpectrumRoom';
import WordRaceEntry from './games/wordrace/WordRaceEntry';
import WordRaceRoom from './games/wordrace/WordRaceRoom';
import Home from './pages/Home';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-dots" aria-hidden>
            <i className="dot red" />
            <i className="dot blue" />
            <i className="dot tan" />
            <i className="dot black" />
          </span>
          Party Games
        </Link>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ciphergrid" element={<CipherGridEntry />} />
          <Route path="/ciphergrid/:code" element={<CipherGridRoom />} />
          <Route path="/infiltrator" element={<InfiltratorEntry />} />
          <Route path="/infiltrator/:code" element={<InfiltratorRoom />} />
          <Route path="/spectrum" element={<SpectrumEntry />} />
          <Route path="/spectrum/:code" element={<SpectrumRoom />} />
          <Route path="/oneword" element={<OneWordEntry />} />
          <Route path="/oneword/:code" element={<OneWordRoom />} />
          <Route path="/nightfall" element={<NightfallEntry />} />
          <Route path="/nightfall/:code" element={<NightfallRoom />} />
          <Route path="/letterrush" element={<LetterRushEntry />} />
          <Route path="/letterrush/:code" element={<LetterRushRoom />} />
          <Route path="/pairrush" element={<PairRushEntry />} />
          <Route path="/pairrush/:code" element={<PairRushRoom />} />
          <Route path="/bluffdice" element={<BluffDiceEntry />} />
          <Route path="/bluffdice/:code" element={<BluffDiceRoom />} />
          <Route path="/wordrace" element={<WordRaceEntry />} />
          <Route path="/wordrace/:code" element={<WordRaceRoom />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="card center-card">
      <h2>Page not found</h2>
      <Link to="/" className="btn">
        Back to games
      </Link>
    </div>
  );
}
