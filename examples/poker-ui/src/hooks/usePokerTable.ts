/**
 * usePokerTable — fetches and subscribes to the PokerTable PDA on-chain
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useAnchorPrograms, derivePokerTablePDA, getConnection } from '../lib/anchor';
import { PokerTable, PokerPhase } from '../types';

/** Map raw Anchor account data → our PokerTable type */
function parsePokerTable(raw: any): PokerTable {
  const phaseKey = Object.keys(raw.phase)[0];
  const phaseMap: Record<string, PokerPhase> = {
    preFLop:  PokerPhase.PreFlop,
    preFlop:  PokerPhase.PreFlop,
    flop:     PokerPhase.Flop,
    turn:     PokerPhase.Turn,
    river:    PokerPhase.River,
    showdown: PokerPhase.Showdown,
  };

  return {
    gameSession:         raw.gameSession as PublicKey,
    phase:               phaseMap[phaseKey] ?? PokerPhase.PreFlop,
    dealerIndex:         raw.dealerIndex,
    currentPlayer:       raw.currentPlayer,
    potMint:             raw.potMint as PublicKey,
    potAccount:          raw.potAccount as PublicKey,
    escrowAccount:       raw.escrowAccount as PublicKey,
    playerStacks:        raw.playerStacks as PublicKey[],
    playerBets:          raw.playerBets as PublicKey[],
    currentBet:          BigInt(raw.currentBet.toString()),
    foldedBitmap:        raw.foldedBitmap,
    allInBitmap:         raw.allInBitmap,
    handVerifiedBitmap:  raw.handVerifiedBitmap,
    smallBlind:          BigInt(raw.smallBlind.toString()),
    bigBlind:            BigInt(raw.bigBlind.toString()),
    handNumber:          raw.handNumber,
    bump:                raw.bump,
  };
}

export function usePokerTable(gameId: string | null) {
  const programs = useAnchorPrograms();
  const queryClient = useQueryClient();

  const gameIdBigInt = gameId ? (() => {
    try {
      if (/^[0-9a-fA-F]+$/.test(gameId) && isNaN(Number(gameId))) {
        return BigInt('0x' + gameId);
      }
      return BigInt(gameId);
    } catch {
      return null;
    }
  })() : null;

  const pda = gameIdBigInt !== null
    ? derivePokerTablePDA(gameIdBigInt)[0]
    : null;

  const query = useQuery({
    queryKey: ['pokerTable', gameId],
    queryFn: async (): Promise<PokerTable | null> => {
      if (!programs || !pda || gameIdBigInt === null) return null;

      try {
        const raw = await programs.texasHoldem.account['pokerTable'].fetch(pda);
        return parsePokerTable(raw);
      } catch (err: any) {
        if (err?.message?.includes('Account does not exist')) return null;
        throw err;
      }
    },
    enabled: !!programs && !!pda,
    refetchInterval: false,
    staleTime: Infinity,
    retry: 1,
  });

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!pda || !programs) return;

    const connection = getConnection();
    const subId = connection.onAccountChange(
      pda,
      () => {
        queryClient.invalidateQueries({ queryKey: ['pokerTable', gameId] });
      },
      'confirmed'
    );

    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [pda?.toBase58(), programs, gameId, queryClient]);

  return query;
}
