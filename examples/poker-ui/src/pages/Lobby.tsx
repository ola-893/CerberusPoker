import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Users, Plus, ChevronLeft } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Lobby() {
  const navigate = useNavigate();
  const { connected } = useWallet();
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [smallBlind, setSmallBlind] = useState('1');
  const [bigBlind, setBigBlind] = useState('2');

  // Redirect to landing if not connected
  useEffect(() => {
    if (!connected) {
      navigate('/');
    }
  }, [connected, navigate]);

  // TODO: Replace with actual TanStack Query
  const mockTables = [
    { id: 'a3f9', players: 2, maxPlayers: 6, blinds: '1/2', status: 'Waiting' },
    { id: 'b7c2', players: 4, maxPlayers: 4, blinds: '5/10', status: 'Full' },
  ];

  const handleCreateTable = () => {
    // TODO: Call create_game + create_table instructions
    console.log('Creating table:', { maxPlayers, smallBlind, bigBlind });
    // For now, navigate to a mock game
    navigate('/game/demo');
  };

  if (!connected) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between border-b border-zinc-900">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-lg bg-surface-raised border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-gold rounded-lg rotate-45" />
              <div className="absolute inset-2 bg-background rounded-sm rotate-45" />
            </div>
            <span className="font-mono font-bold text-lg tracking-tight">
              CerberusPoker
            </span>
          </div>
        </div>

        <WalletMultiButton className="!bg-surface-raised !text-zinc-100 hover:!bg-zinc-800 !rounded-lg !h-10 !px-4 !text-sm" />
      </header>

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <header className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Game Lobby</h1>
            <p className="text-zinc-500">Create a new table or join an existing game</p>
          </header>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left: Create Table Form */}
            <div className="lg:col-span-4">
              <div className="bg-surface border border-zinc-800 p-8 rounded-3xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-gold" />
                  Create Table
                </h2>

                <div className="space-y-6">
                  {/* Max Players */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Max Players
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                        className="w-10 h-10 bg-surface-raised border border-zinc-800 rounded-lg hover:border-gold/30 transition-colors"
                      >
                        −
                      </button>
                      <div className="flex-1 text-center font-mono text-2xl font-bold">
                        {maxPlayers}
                      </div>
                      <button
                        onClick={() => setMaxPlayers(Math.min(6, maxPlayers + 1))}
                        className="w-10 h-10 bg-surface-raised border border-zinc-800 rounded-lg hover:border-gold/30 transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">2-6 players</p>
                  </div>

                  {/* Small Blind */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Small Blind (USDC+)
                    </label>
                    <input
                      type="number"
                      value={smallBlind}
                      onChange={(e) => {
                        setSmallBlind(e.target.value);
                        setBigBlind((parseFloat(e.target.value) * 2).toString());
                      }}
                      className="w-full px-4 py-3 bg-surface-raised border border-zinc-800 rounded-lg font-mono focus:border-gold/50 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Big Blind */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Big Blind (USDC+)
                    </label>
                    <input
                      type="number"
                      value={bigBlind}
                      onChange={(e) => setBigBlind(e.target.value)}
                      className="w-full px-4 py-3 bg-surface-raised border border-zinc-800 rounded-lg font-mono focus:border-gold/50 focus:outline-none transition-colors"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Must be ≥ 2× small blind
                    </p>
                  </div>

                  {/* Create Button */}
                  <button
                    onClick={handleCreateTable}
                    className="w-full py-4 bg-gold text-background rounded-xl font-bold uppercase tracking-widest text-sm shadow-gold-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Create Table
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Open Tables List */}
            <div className="lg:col-span-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">Open Tables</h2>
                <p className="text-sm text-zinc-500 font-mono">
                  {mockTables.length} tables found
                </p>
              </div>

              {mockTables.length === 0 ? (
                <div className="bg-surface border border-zinc-800 rounded-3xl p-12 text-center">
                  <p className="text-zinc-500">
                    No open tables. Be the first to create one.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mockTables.map((table) => (
                    <motion.div
                      key={table.id}
                      whileHover={{ y: -4 }}
                      onClick={() => navigate(`/game/${table.id}`)}
                      className="bg-surface border border-zinc-800 p-6 rounded-3xl hover:border-gold/30 transition-all cursor-pointer group"
                    >
                      {/* Status Badge */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              table.status === 'Waiting' ? 'bg-waiting' : 'bg-zinc-600'
                            )}
                          />
                          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                            {table.status}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-zinc-600">
                          #{table.id}
                        </span>
                      </div>

                      {/* Table Info */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Users className="w-4 h-4" />
                          <span className="font-mono text-sm">
                            {table.players} / {table.maxPlayers} players
                          </span>
                        </div>
                        <div className="text-sm text-zinc-500">
                          Blinds: <span className="font-mono text-zinc-100">{table.blinds} USDC+</span>
                        </div>
                      </div>

                      {/* Join Button */}
                      <button
                        disabled={table.status === 'Full'}
                        className={cn(
                          'w-full mt-4 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all',
                          table.status === 'Full'
                            ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                            : 'bg-gold/10 text-gold border border-gold/20 group-hover:bg-gold group-hover:text-background'
                        )}
                      >
                        {table.status === 'Full' ? 'Table Full' : 'Join Game'}
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
