import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletContextProvider } from './contexts/WalletContextProvider';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import GameTable from './pages/GameTable';

export default function App() {
  return (
    <WalletContextProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-zinc-100 font-sans selection:bg-gold/30 selection:text-gold antialiased">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/game/:gameId" element={<GameTable />} />
          </Routes>
        </div>
      </BrowserRouter>
    </WalletContextProvider>
  );
}
