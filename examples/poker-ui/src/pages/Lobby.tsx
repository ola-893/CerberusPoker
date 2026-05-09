import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useQuery } from '@tanstack/react-query';
import { Users, Plus, ChevronLeft, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAnchorPrograms, CERBERUS_POKER_PROGRAM_ID, TEXAS_HOLDEM_PROGRAM_ID, getConnection } from '../lib/anchor';
import { createGame, joinGame } from '../lib/transactions';
import { SystemProgram, PublicKey } from '@solana/web3.js';
import WalletBalances from '../components/WalletBalances';

interface TableInfo {
  gameId: string;
  numPlayers: number;
  maxPlayers: number;
  smallBlind: bigint;
  bigBlind: bigint;
  state: string;
  players: string[]; // pubkeys of joined players
}

/** Fetch all open GameSession + PokerTable accounts and merge them */
function useOpenTables() {
  const programs = useAnchorPrograms();

  return useQuery({
    queryKey: ['openTables'],
    queryFn: async (): Promise<TableInfo[]> => {
      if (!programs) return [];

      try {
        // Fetch GameSession accounts (cerberus_poker) and PokerTable accounts (texas_holdem) in parallel
        const [sessions, pokerTables] = await Promise.all([
          (programs.cerberusPoker.account as any)['gameSession'].all(),
          (programs.texasHoldem.account as any)['pokerTable'].all(),
        ]);

        // Build a map of gameId → PokerTable for blind info
        const tableMap = new Map<string, any>();
        for (const t of pokerTables) {
          const raw = t.account as any;
          tableMap.set(raw.gameSession.toString(), raw);
        }

        const tables: TableInfo[] = [];
        for (const s of sessions) {
          const raw = s.account as any;
          const stateKey = Object.keys(raw.state)[0] ?? 'lobby';

          // Only show Lobby (waiting for players) tables
          if (stateKey !== 'lobby') continue;

          // Look up PokerTable by game_session PDA pubkey
          const pokerTable = tableMap.get(s.publicKey.toString());

          tables.push({
            gameId:     raw.gameId.toString(),
            numPlayers: raw.numPlayers,
            maxPlayers: raw.maxPlayers,
            smallBlind: pokerTable ? BigInt(pokerTable.smallBlind.toString()) : BigInt(0),
            bigBlind:   pokerTable ? BigInt(pokerTable.bigBlind.toString())   : BigInt(0),
            state:      stateKey,
            players:    (raw.players as any[])
                          .slice(0, raw.numPlayers)
                          .map((p: any) => p.toString()),
          });
        }

        return tables;
      } catch (err) {
        console.error('Failed to fetch tables:', err);
        return [];
      }
    },
    enabled: !!programs,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export default function Lobby() {
  const navigate = useNavigate();
  const { connected, publicKey } = useWallet();
  const programs = useAnchorPrograms();
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [smallBlind, setSmallBlind] = useState('1');
  const [bigBlind, setBigBlind] = useState('2');
  const [isCreating, setIsCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: tables = [], isLoading: loadingTables, refetch } = useOpenTables();

  // Redirect to landing if not connected
  useEffect(() => {
    if (!connected) navigate('/');
  }, [connected, navigate]);

  const handleCreateTable = async () => {
    if (!programs || !publicKey) return;
    setIsCreating(true);
    setTxError(null);

    try {
      // Generate a random game ID
      const gameId = BigInt(Math.floor(Math.random() * 1_000_000_000));
      const sb = BigInt(Math.round(parseFloat(smallBlind) * 1_000_000)); // USDC has 6 decimals
      const bb = BigInt(Math.round(parseFloat(bigBlind)   * 1_000_000));

      const { gameId: createdId } = await createGame(
        programs.cerberusPoker,
        programs.texasHoldem,
        gameId,
        maxPlayers,
        sb,
        bb
      );

      // Creator must also join their own game (create_game does not auto-join)
      await joinGame(programs.cerberusPoker, createdId);

      navigate(`/game/${createdId.toString()}`);
    } catch (err: any) {
      console.error('Create table failed:', err);
      setTxError(err?.message ?? 'Transaction failed');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinTable = async (gameId: string) => {
    if (!programs || !publicKey) return;
    setJoiningId(gameId);
    setTxError(null);

    try {
      const id = BigInt(gameId);
      await joinGame(programs.cerberusPoker, id);
      navigate(`/game/${gameId}`);
    } catch (err: any) {
      console.error('Join table failed:', err);
      setTxError(err?.message ?? 'Transaction failed');
    } finally {
      setJoiningId(null);
    }
  };

  if (!connected) return null;

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
            <span className="font-mono font-bold text-lg tracking-tight">CerberusPoker</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <WalletBalances />
          <WalletMultiButton className="!bg-surface-raised !text-zinc-100 hover:!bg-zinc-800 !rounded-lg !h-10 !px-4 !text-sm" />
        </div>
      </header>

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Game Lobby</h1>
            <p className="text-zinc-500">Create a new table or join an existing game</p>
          </header>

          {/* Error Banner */}
          {txError && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm font-mono">
              ⚠ {txError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left: Create Table */}
            <div className="lg:col-span-4">
              <div className="bg-surface border border-zinc-800 p-8 rounded-3xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-gold" />
                  Create Table
                </h2>

                <div className="space-y-6">
                  {/* Max Players */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Max Players</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                        className="w-10 h-10 bg-surface-raised border border-zinc-800 rounded-lg hover:border-gold/30 transition-colors"
                      >−</button>
                      <div className="flex-1 text-center font-mono text-2xl font-bold">{maxPlayers}</div>
                      <button
                        onClick={() => setMaxPlayers(Math.min(6, maxPlayers + 1))}
                        className="w-10 h-10 bg-surface-raised border border-zinc-800 rounded-lg hover:border-gold/30 transition-colors"
                      >+</button>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">2–6 players</p>
                  </div>

                  {/* Small Blind */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Small Blind (USDC+)</label>
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
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Big Blind (USDC+)</label>
                    <input
                      type="number"
                      value={bigBlind}
                      onChange={(e) => setBigBlind(e.target.value)}
                      className="w-full px-4 py-3 bg-surface-raised border border-zinc-800 rounded-lg font-mono focus:border-gold/50 focus:outline-none transition-colors"
                    />
                    <p className="text-xs text-zinc-600 mt-1">Must be ≥ 2× small blind</p>
                  </div>

                  <button
                    onClick={handleCreateTable}
                    disabled={isCreating || !programs}
                    className="w-full py-4 bg-gold text-background rounded-xl font-bold uppercase tracking-widest text-sm shadow-gold-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating & Joining...
                      </>
                    ) : 'Create Table'}
                  </button>

                  {!programs && (
                    <p className="text-xs text-zinc-600 text-center">Connect wallet to create a table</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Open Tables */}
            <div className="lg:col-span-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">Open Tables</h2>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-zinc-500 font-mono">
                    {loadingTables ? 'Loading...' : `${tables.length} table${tables.length !== 1 ? 's' : ''} found`}
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="w-8 h-8 rounded-lg bg-surface-raised border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    <RefreshCw className={cn('w-4 h-4', loadingTables && 'animate-spin')} />
                  </button>
                </div>
              </div>

              {loadingTables ? (
                <div className="bg-surface border border-zinc-800 rounded-3xl p-12 flex items-center justify-center gap-3 text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Fetching tables from devnet...</span>
                </div>
              ) : tables.length === 0 ? (
                <div className="bg-surface border border-zinc-800 rounded-3xl p-12 text-center">
                  <p className="text-zinc-500 mb-2">No open tables on devnet.</p>
                  <p className="text-zinc-600 text-sm">Be the first to create one.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tables.map((table) => {
                    const isFull = table.numPlayers >= table.maxPlayers;
                    const isJoining = joiningId === table.gameId;
                    const sbDisplay = (Number(table.smallBlind) / 1_000_000).toFixed(2);
                    const bbDisplay = (Number(table.bigBlind)   / 1_000_000).toFixed(2);
                    const alreadyJoined = !!publicKey && table.players.includes(publicKey.toString());

                    return (
                      <motion.div
                        key={table.gameId}
                        whileHover={{ y: -4 }}
                        className="bg-surface border border-zinc-800 p-6 rounded-3xl hover:border-gold/30 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              'w-2 h-2 rounded-full',
                              isFull ? 'bg-zinc-600' : 'bg-waiting animate-pulse'
                            )} />
                            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                              {isFull ? 'Full' : alreadyJoined ? 'Joined' : 'Waiting'}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-zinc-600">
                            #{table.gameId.slice(-6)}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-zinc-400">
                            <Users className="w-4 h-4" />
                            <span className="font-mono text-sm">
                              {table.numPlayers} / {table.maxPlayers} players
                            </span>
                          </div>
                          <div className="text-sm text-zinc-500">
                            Blinds: <span className="font-mono text-zinc-100">{sbDisplay}/{bbDisplay} USDC+</span>
                          </div>
                        </div>

                        <button
                          disabled={(isFull && !alreadyJoined) || isJoining || !programs}
                          onClick={() => alreadyJoined
                            ? navigate(`/game/${table.gameId}`)
                            : handleJoinTable(table.gameId)
                          }
                          className={cn(
                            'w-full mt-4 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2',
                            alreadyJoined
                              ? 'bg-gold text-background hover:scale-[1.02]'
                              : isFull || !programs
                                ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                                : 'bg-gold/10 text-gold border border-gold/20 group-hover:bg-gold group-hover:text-background'
                          )}
                        >
                          {isJoining ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Joining...</>
                          ) : alreadyJoined ? 'Enter Game →'
                            : isFull ? 'Table Full'
                            : 'Join Game'}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
