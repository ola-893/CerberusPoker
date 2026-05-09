/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useGameSession } from './useGameSession';
import { usePokerTable } from './usePokerTable';
import { useDealtCards, decryptHoleCards } from './useDealtCard';
import { useUIStore } from '../store/gameStore';
import { deriveUIPhase } from '../lib/deriveUIPhase';
import { UIPhase, UNREVEALED, COMMUNITY_CARD } from '../types';

/**
 * Master hook that combines all game state sources
 * Returns everything needed to render the GameTable
 */
export function useGameState(gameId: string | null) {
  const { publicKey } = useWallet();
  const { data: gameSession, isLoading: loadingSession } = useGameSession(gameId);
  const { data: pokerTable, isLoading: loadingTable } = usePokerTable(gameId);
  const { sawShowdownComplete, turnStartedAt } = useUIStore();

  // Derive my player index
  const myPlayerIndex = useMemo(() => {
    if (!gameSession || !publicKey) return null;
    return gameSession.players.findIndex(p => p.equals(publicKey));
  }, [gameSession, publicKey]);

  const { data: dealtCards } = useDealtCards(gameId, gameSession, myPlayerIndex);

  // Derive UI phase
  const phase = useMemo(() => {
    return deriveUIPhase(gameSession?.state, pokerTable?.phase, sawShowdownComplete);
  }, [gameSession?.state, pokerTable?.phase, sawShowdownComplete]);

  // Decrypt hole cards
  const myHoleCards = useMemo(() => {
    return decryptHoleCards(dealtCards ?? null);
  }, [dealtCards]);

  // Extract community cards from unmasked_cards
  const communityCards = useMemo(() => {
    if (!gameSession) return [0xfe, 0xfe, 0xfe, 0xfe, 0xfe];
    
    const cards: number[] = [];
    for (let i = 0; i < 52; i++) {
      if (gameSession.cardAssignedTo[i] === COMMUNITY_CARD) {
        const cardValue = gameSession.unmaskedCards[i] ?? UNREVEALED;
        cards.push(cardValue < 52 ? cardValue : UNREVEALED);
      }
    }
    
    // Pad to 5 cards
    while (cards.length < 5) {
      cards.push(0xfe);
    }
    
    return cards.slice(0, 5);
  }, [gameSession]);

  // Check if it's my turn
  const isMyTurn = useMemo(() => {
    if (!pokerTable || myPlayerIndex === null) return false;
    return pokerTable.currentPlayer === myPlayerIndex && phase !== UIPhase.Lobby;
  }, [pokerTable, myPlayerIndex, phase]);

  // Check if I've folded
  const isFolded = useMemo(() => {
    if (!pokerTable || myPlayerIndex === null) return false;
    return ((pokerTable.foldedBitmap >> myPlayerIndex) & 1) === 1;
  }, [pokerTable, myPlayerIndex]);

  // Check if I'm all-in
  const isAllIn = useMemo(() => {
    if (!pokerTable || myPlayerIndex === null) return false;
    return ((pokerTable.allInBitmap >> myPlayerIndex) & 1) === 1;
  }, [pokerTable, myPlayerIndex]);

  const pot = useMemo(() => {
    if (!pokerTable) return 0;
    return Number(pokerTable.potTotal) / 1_000_000_000;
  }, [pokerTable]);

  // Check timeouts
  const now = Date.now() / 1000;
  const shuffleTimeout = gameSession && gameSession.shuffleDeadline > 0 && now > Number(gameSession.shuffleDeadline);
  const revealTimeout = gameSession && gameSession.revealDeadline > 0 && now > Number(gameSession.revealDeadline);
  const betTimeout = turnStartedAt && (Date.now() - turnStartedAt) > 120000; // 120 seconds

  return {
    // Loading states
    isLoading: loadingSession || loadingTable,
    
    // Account data
    gameSession,
    pokerTable,
    
    // Derived state
    phase,
    myPlayerIndex,
    myHoleCards,
    communityCards,
    pot,
    isMyTurn,
    isFolded,
    isAllIn,
    
    // Timeout flags
    shuffleTimeout,
    revealTimeout,
    betTimeout,
  };
}
