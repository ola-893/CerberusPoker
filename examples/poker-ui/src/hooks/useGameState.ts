/**
 * useGameState — master hook combining all on-chain game state
 * Returns everything needed to render the GameTable
 */

import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useGameSession } from './useGameSession';
import { usePokerTable } from './usePokerTable';
import { useDealtCard, decryptHoleCards } from './useDealtCard';
import { useUIStore } from '../store/gameStore';
import { deriveUIPhase } from '../lib/deriveUIPhase';
import { UIPhase, UNREVEALED, COMMUNITY_CARD } from '../types';

export function useGameState(gameId: string | null) {
  const { publicKey } = useWallet();
  const { data: gameSession, isLoading: loadingSession } = useGameSession(gameId);
  const { data: pokerTable, isLoading: loadingTable } = usePokerTable(gameId);
  const { sawShowdownComplete, turnStartedAt } = useUIStore();

  // Derive my player index from the on-chain players array
  const myPlayerIndex = useMemo(() => {
    if (!gameSession || !publicKey) return null;
    const idx = gameSession.players.findIndex(p => p.equals(publicKey));
    return idx === -1 ? null : idx;
  }, [gameSession, publicKey]);

  // Fetch my two hole cards — always call with stable values.
  // Use -1 as sentinel for "not yet known" — the hook disables itself when null.
  const card2Index = myPlayerIndex !== null && gameSession
    ? myPlayerIndex + gameSession.maxPlayers
    : null;

  const { data: dealtCard1 } = useDealtCard(gameId, myPlayerIndex);
  const { data: dealtCard2 } = useDealtCard(gameId, card2Index);

  // Derive UI phase from game state + poker phase
  const phase = useMemo(() => {
    return deriveUIPhase(gameSession?.state, pokerTable?.phase, sawShowdownComplete);
  }, [gameSession?.state, pokerTable?.phase, sawShowdownComplete]);

  // Hole cards — available after MXE deal callback completes
  const myHoleCards = useMemo(() => {
    return decryptHoleCards(dealtCard1 ?? null, dealtCard2 ?? null);
  }, [dealtCard1, dealtCard2]);

  // Community cards — extracted from unmasked_cards array
  const communityCards = useMemo(() => {
    if (!gameSession) return [0xfe, 0xfe, 0xfe, 0xfe, 0xfe];

    const cards: number[] = [];
    const revealMask = gameSession.revealBitmap[0] ?? BigInt(0);

    for (let i = 0; i < 52; i++) {
      if (gameSession.cardAssignedTo[i] === COMMUNITY_CARD) {
        const isRevealed = (revealMask >> BigInt(i)) & BigInt(1);
        cards.push(isRevealed ? (gameSession.unmaskedCards[i] ?? UNREVEALED) : UNREVEALED);
      }
    }

    while (cards.length < 5) cards.push(0xfe);
    return cards.slice(0, 5);
  }, [gameSession]);

  // Is it my turn to act?
  const isMyTurn = useMemo(() => {
    if (!pokerTable || myPlayerIndex === null) return false;
    return pokerTable.currentPlayer === myPlayerIndex && phase !== UIPhase.Lobby;
  }, [pokerTable, myPlayerIndex, phase]);

  // Have I folded?
  const isFolded = useMemo(() => {
    if (!pokerTable || myPlayerIndex === null) return false;
    return ((pokerTable.foldedBitmap >> myPlayerIndex) & 1) === 1;
  }, [pokerTable, myPlayerIndex]);

  // Am I all-in?
  const isAllIn = useMemo(() => {
    if (!pokerTable || myPlayerIndex === null) return false;
    return ((pokerTable.allInBitmap >> myPlayerIndex) & 1) === 1;
  }, [pokerTable, myPlayerIndex]);

  // Pot size — sum of all player bets (read from escrow account balance)
  // TODO: fetch actual SPL token balance from pokerTable.escrowAccount
  const pot = useMemo(() => {
    return 0; // Will be populated once we fetch the escrow token account
  }, []);

  // Timeout checks
  const now = Date.now() / 1000;
  const shuffleTimeout = !!(gameSession && Number(gameSession.shuffleDeadline) > 0 && now > Number(gameSession.shuffleDeadline));
  const revealTimeout  = !!(gameSession && Number(gameSession.revealDeadline) > 0  && now > Number(gameSession.revealDeadline));
  const betTimeout     = !!(turnStartedAt && (Date.now() - turnStartedAt) > 120_000);

  return {
    // Loading
    isLoading: loadingSession || loadingTable,

    // Raw account data
    gameSession,
    pokerTable,

    // Derived
    phase,
    myPlayerIndex,
    myHoleCards,
    communityCards,
    pot,
    isMyTurn,
    isFolded,
    isAllIn,

    // Timeouts
    shuffleTimeout,
    revealTimeout,
    betTimeout,
  };
}
