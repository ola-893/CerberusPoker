/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useGameState } from '../hooks/useGameState';
import { cn } from '../lib/utils';
import PlayerSeat from '../components/PlayerSeat';
import CommunityCards from '../components/CommunityCards';
import HoleCards from '../components/HoleCards';
import ActionBar from '../components/ActionBar';
import { UIPhase, Action, GameState, PokerPhase } from '../types';
import { Info, Menu, Maximize2, ShieldCheck, ChevronLeft } from 'lucide-react';
import { useAnchorPrograms } from '../lib/anchor';
import { playerAction, timeoutShuffle, timeoutReveal, timeoutBet } from '../lib/transactions';
import WalletBalances from '../components/WalletBalances';

export default function GameTable() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const programs = useAnchorPrograms();
  const { publicKey } = useWallet(); // ← must be before any early returns
  
  // Convert gameId to BigInt safely (handle hex strings from URL)
  const gameIdBigInt = useMemo(() => {
    if (!gameId) return BigInt(12345);
    // If it's a hex string (like 'a3f9'), convert it
    if (/^[0-9a-fA-F]+$/.test(gameId)) {
      return BigInt('0x' + gameId);
    }
    // Otherwise try to parse as decimal
    try {
      return BigInt(gameId);
    } catch {
      return BigInt(12345);
    }
  }, [gameId]);
  
  const {
    isLoading,
    gameSession,
    pokerTable,
    phase,
    myPlayerIndex,
    myHoleCards,
    communityCards,
    pot,
    isMyTurn,
    isFolded,
    isAllIn,
    shuffleTimeout,
    revealTimeout,
    betTimeout,
  } = useGameState(gameId || null);

  // Handle action button clicks — calls player_action on-chain
  const handleAction = useCallback(async (action: Action, amount?: bigint) => {
    if (!programs || !gameIdBigInt) return;
    try {
      await playerAction(programs.texasHoldem, gameIdBigInt, action, amount ?? BigInt(0));
    } catch (err) { console.error('Action failed:', err); }
  }, [programs, gameIdBigInt]);

  const handleTimeoutShuffle = useCallback(async () => {
    if (!programs || !gameIdBigInt) return;
    try { await timeoutShuffle(programs.cerberusPoker, gameIdBigInt); }
    catch (err) { console.error('Timeout shuffle failed:', err); }
  }, [programs, gameIdBigInt]);

  const handleTimeoutReveal = useCallback(async () => {
    if (!programs || !gameIdBigInt) return;
    try { await timeoutReveal(programs.cerberusPoker, gameIdBigInt); }
    catch (err) { console.error('Timeout reveal failed:', err); }
  }, [programs, gameIdBigInt]);

  const handleTimeoutBet = useCallback(async () => {
    if (!programs || !gameIdBigInt) return;
    try { await timeoutBet(programs.texasHoldem, gameIdBigInt); }
    catch (err) { console.error('Timeout bet failed:', err); }
  }, [programs, gameIdBigInt]);

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
          <div className="text-zinc-500 font-mono text-sm uppercase tracking-widest">
            Loading game...
          </div>
        </div>
      </div>
    );
  }

  // If no game data after loading, use mock data for UI development
  const useMockData = !gameSession || !pokerTable;
  
  const mockGameSession = {
    gameId: gameIdBigInt,
    numPlayers: 4,
    maxPlayers: 6,
    state: GameState.Active,
    players: Array(4).fill(publicKey ?? PublicKey.default),
    shuffleBitmap: 0,
    shuffleDeadline: BigInt(0),
    revealBitmap: Array(52).fill(BigInt(0)),
    revealDeadline: BigInt(0),
    cardAssignedTo: new Array(52).fill(0xFE),
    unmaskedCards: new Array(52).fill(0xFF),
    pendingRevealCardIndex: 0xfe,
    pendingDealCardIndex: 0xfe,
    pendingDealPlayerIndex: 0xfe,
  };

  const mockPokerTable = {
    gameId: gameIdBigInt,
    smallBlind: BigInt(1),
    bigBlind: BigInt(2),
    currentBet: BigInt(2),
    currentPlayer: 0,
    dealerIndex: 0,
    phase: PokerPhase.PreFlop,
    handNumber: 1,
    foldedBitmap: 0,
    allInBitmap: 0,
    handVerifiedBitmap: 0,
    lastActionTime: BigInt(0),
    numPlayers: 4,
    actedBitmap: 0,
    winnersBitmap: 0,
    winnerCount: 0,
    lastRaise: BigInt(2),
    potTotal: BigInt(4_500_000_000),
    playerRoundBets: Array(10).fill(BigInt(0)),
  };

  const displayGameSession = useMockData ? mockGameSession : gameSession;
  const displayPokerTable = useMockData ? mockPokerTable : pokerTable;
  const displayPhase = useMockData ? UIPhase.PreFlop : phase;
  const displayMyPlayerIndex = useMockData ? 0 : myPlayerIndex;
  const displayMyHoleCards: [number, number] | null = useMockData ? [0, 13] : myHoleCards; // Ace of Clubs, Ace of Diamonds
  const displayCommunityCards = useMockData ? [0xFF, 0xFF, 0xFF, 0xFF, 0xFF] : communityCards;
  const displayPot = useMockData ? 4.5 : pot;
  const displayIsMyTurn = useMockData ? true : isMyTurn;

  // Position mapping for the oval table (6 max players)
  // Hero is always at bottom center
  const seatPositions = [
    "bottom-[-40px] left-1/2 -translate-x-1/2", // Hero (index 0 relative to hero)
    "left-[-60px] top-1/2 -translate-y-1/2",    // Left
    "left-[10%] top-[10%]",                      // Top-left
    "top-[-40px] left-1/2 -translate-x-1/2",    // Top-center
    "right-[10%] top-[10%]",                     // Top-right
    "right-[-60px] top-1/2 -translate-y-1/2",   // Right
  ];

  // Rotate seats so hero is always at bottom
  const getRotatedSeatIndex = (absoluteIndex: number) => {
    if (displayMyPlayerIndex === null) return absoluteIndex;
    return (absoluteIndex - displayMyPlayerIndex + displayGameSession.numPlayers) % displayGameSession.numPlayers;
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background flex flex-col items-center justify-center">
      
      {/* HUD - Non-Table Elements */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-40">
        <div className="flex justify-between items-start pointer-events-auto">
          <div className="flex items-center gap-4">
             <button 
               onClick={() => navigate('/lobby')}
               className="w-10 h-10 rounded-xl bg-surface-raised border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
             >
               <ChevronLeft className="w-6 h-6" />
             </button>
             <div>
                <h2 className="font-mono font-bold text-lg leading-none mb-1 text-zinc-100">
                  Game #{displayGameSession.gameId.toString()}
                </h2>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-active animate-pulse" />
                   <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">
                     {displayPhase}
                   </span>
                </div>
             </div>
          </div>
          
          <div className="flex gap-2">
             <button className="w-10 h-10 rounded-xl bg-surface-raised border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100">
               <Info className="w-5 h-5" />
             </button>
             <button className="w-10 h-10 rounded-xl bg-surface-raised border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100">
               <Maximize2 className="w-5 h-5" />
             </button>
             <button className="w-10 h-10 rounded-xl bg-surface-raised border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100">
               <Menu className="w-5 h-5" />
             </button>
          </div>
        </div>

        <div className="flex justify-between items-end">
           <div className="bg-surface-raised/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-zinc-800 flex items-center gap-4 pointer-events-auto">
              <div className="p-2 bg-active/20 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-active" />
              </div>
              <div>
                <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest leading-none mb-1">
                  On-Chain Security
                </div>
                <div className="font-mono text-active text-xs font-bold leading-none">
                  Arcium MXE Verified
                </div>
              </div>
           </div>
        </div>
      </div>

      {/* Timeout Banners */}
      {shuffleTimeout && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-waiting/90 backdrop-blur-md px-6 py-3 rounded-xl border border-waiting flex items-center gap-4">
          <span className="text-background font-bold">⚠ Shuffle stalled — a player stopped responding.</span>
          <button className="px-4 py-1 bg-background text-waiting rounded-lg font-bold text-sm hover:bg-zinc-900">
            Claim Timeout
          </button>
        </div>
      )}
      {revealTimeout && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-waiting/90 backdrop-blur-md px-6 py-3 rounded-xl border border-waiting flex items-center gap-4">
          <span className="text-background font-bold">⚠ Reveal stalled — a player stopped responding.</span>
          <button className="px-4 py-1 bg-background text-waiting rounded-lg font-bold text-sm hover:bg-zinc-900">
            Claim Timeout
          </button>
        </div>
      )}
      {betTimeout && isMyTurn && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-waiting/90 backdrop-blur-md px-6 py-3 rounded-xl border border-waiting flex items-center gap-4">
          <span className="text-background font-bold">⚠ You're taking too long.</span>
          <button className="px-4 py-1 bg-background text-waiting rounded-lg font-bold text-sm hover:bg-zinc-900">
            Force Fold
          </button>
        </div>
      )}

      {/* The Poker Table Area */}
      <div className="relative w-full max-w-[1200px] aspect-[16/9] flex items-center justify-center scale-90 md:scale-100">
        
        {/* Table Felt Background */}
        <div className="table-oval relative w-[90%] h-[75%] bg-table-felt border-[16px] border-table-rail shadow-[0_0_100px_rgba(0,0,0,0.8),inset_0_0_100px_rgba(45,90,45,0.4)]">
          {/* Inner Felt Shadow */}
          <div className="absolute inset-2 table-oval border border-white/5 opacity-50" />
          <div className="absolute inset-10 table-oval border-[2px] border-dashed border-white/5 opacity-10" />

          {/* Table Center Logo */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <h1 className="text-8xl font-mono font-bold tracking-tighter uppercase select-none">Cerberus</h1>
          </div>

          {/* Community Cards & Pot */}
          <CommunityCards cards={displayCommunityCards} pot={displayPot} />

          {/* Player Seats */}
          {Array.from({ length: displayGameSession.numPlayers }).map((_, absoluteIndex) => {
            const relativeIndex = getRotatedSeatIndex(absoluteIndex);
            const playerAddress = displayGameSession.players[absoluteIndex];
            const isFoldedPlayer = ((displayPokerTable.foldedBitmap >> absoluteIndex) & 1) === 1;
            const isAllInPlayer = ((displayPokerTable.allInBitmap >> absoluteIndex) & 1) === 1;
            const isCurrentTurnPlayer = displayPokerTable.currentPlayer === absoluteIndex;
            const isDealer = displayPokerTable.dealerIndex === absoluteIndex;
            const isSmallBlind = (displayPokerTable.dealerIndex + 1) % displayGameSession.numPlayers === absoluteIndex;
            const isBigBlind = (displayPokerTable.dealerIndex + 2) % displayGameSession.numPlayers === absoluteIndex;
            const hasShuffled = displayGameSession.state === GameState.Shuffle 
              ? ((displayGameSession.shuffleBitmap >> absoluteIndex) & 1) === 1
              : undefined;

            return (
              <PlayerSeat 
                key={absoluteIndex}
                playerAddress={playerAddress!}
                playerIndex={absoluteIndex}
                stack={1000} // TODO: Read from player_stacks token account
                currentBet={0} // TODO: Read from player_bets
                isFolded={isFoldedPlayer}
                isAllIn={isAllInPlayer}
                isCurrentTurn={isCurrentTurnPlayer}
                isDealer={isDealer}
                isSmallBlind={isSmallBlind}
                isBigBlind={isBigBlind}
                hasShuffled={hasShuffled}
                positionClass={seatPositions[relativeIndex]!}
              />
            );
          })}
        </div>

        {/* Hero's Hole Cards */}
        {displayMyHoleCards && displayPhase !== UIPhase.Complete && displayPhase !== UIPhase.Aborted && (
          <HoleCards cards={displayMyHoleCards} />
        )}
      </div>

      {/* Action Bar */}
      {(displayPhase === UIPhase.PreFlop || displayPhase === UIPhase.Flop || displayPhase === UIPhase.Turn || displayPhase === UIPhase.River) && (
        <ActionBar 
          isMyTurn={displayIsMyTurn && !isFolded && !isAllIn}
          currentBet={displayPokerTable.currentBet}
          myStack={1000} // TODO: Read from my token account
          bigBlind={displayPokerTable.bigBlind}
          canCheck={displayPokerTable.currentBet === BigInt(0)}
          onAction={handleAction}
        />
      )}

      {/* Phase Overlays */}
      <AnimatePresence>
        {displayPhase === UIPhase.Shuffle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8"
          >
            <div className="w-24 h-24 mb-8 relative">
                <div className="absolute inset-0 border-4 border-gold/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-gold border-t-transparent rounded-full animate-spin shadow-gold-glow" />
            </div>
            <h3 className="text-4xl font-sans font-bold tracking-tight mb-2">Shuffling Deck</h3>
            <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase mb-8">
              Arcium MPC — Dishonest Majority Secure
            </p>
            
            {/* Shuffle Progress */}
            <div className="flex gap-4">
              {Array.from({ length: displayGameSession.numPlayers }).map((_, i) => {
                const hasShuffled = ((displayGameSession.shuffleBitmap >> i) & 1) === 1;
                return (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className={cn(
                      "w-12 h-12 rounded-full border-2 flex items-center justify-center",
                      hasShuffled ? "border-active bg-active/20 text-active" : "border-zinc-700 text-zinc-700"
                    )}>
                      {hasShuffled ? '✓' : '○'}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono">P{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {displayPhase === UIPhase.Deal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="text-center">
              <h3 className="text-3xl font-sans font-bold tracking-tight mb-2">Dealing Cards</h3>
              <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
                MXE Threshold Decryption
              </p>
            </div>
          </motion.div>
        )}

        {displayPhase === UIPhase.Showdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="text-center">
              <div className="w-16 h-16 mb-6 mx-auto border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
              <h3 className="text-3xl font-sans font-bold tracking-tight mb-2">Revealing Hands</h3>
              <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
                Atomic Showdown via Arcium MPC
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Advice Banner */}
      <div className="fixed top-2 left-1/2 -translate-x-1/2 md:hidden z-[100] w-[90%] bg-gold text-background p-3 rounded-xl text-center shadow-2xl">
         <span className="text-xs font-bold uppercase tracking-widest">Best experienced on desktop</span>
      </div>
    </div>
  );
}
