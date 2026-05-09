/**
 * usePokerTable — fetches and subscribes to the PokerTable PDA on-chain
 * Uses WebSocket account subscription for real-time updates.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { PokerTable, PokerPhase } from '../types';
import { derivePokerTablePDA, useAnchorPrograms, getConnection } from '../lib/anchor';

function parseGameId(gameId: string): bigint {
  if (/^[0-9a-fA-F]+$/.test(gameId) && /[a-fA-F]/.test(gameId)) {
    return BigInt(`0x${gameId}`);
  }
  return BigInt(gameId);
}

function decodeAnchorEnum<T extends string>(value: unknown, fallback: T): T {
  if (typeof value === 'string') return value as T;
  if (value && typeof value === 'object') {
    const [key] = Object.keys(value);
    if (key) return (key.charAt(0).toUpperCase() + key.slice(1)) as T;
  }
  return fallback;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    return BigInt(value.toString());
  }
  return BigInt(0);
}

export function usePokerTable(gameId: string | null) {
  const programs = useAnchorPrograms();
  const queryClient = useQueryClient();

  const gameIdBigInt = gameId ? (() => {
    try { return parseGameId(gameId); } catch { return null; }
  })() : null;

  const pda = gameIdBigInt !== null
    ? derivePokerTablePDA(gameIdBigInt)[0]
    : null;

  const query = useQuery({
    queryKey: ['pokerTable', gameId],
    queryFn: async (): Promise<PokerTable | null> => {
      if (!gameId || !programs || !pda) return null;

      try {
        const account = await (programs.texasHoldem.account as any).pokerTable.fetch(pda);
        const raw = account as Record<string, unknown>;

        return {
          gameSession:        (raw['gameSession'] as PublicKey | undefined) ?? PublicKey.default,
          phase:              decodeAnchorEnum<PokerPhase>(raw['phase'], PokerPhase.PreFlop),
          dealerIndex:        Number(raw['dealerIndex'] ?? 0),
          currentPlayer:      Number(raw['currentPlayer'] ?? 0),
          potMint:            (raw['potMint'] as PublicKey | undefined) ?? PublicKey.default,
          potAccount:         (raw['potAccount'] as PublicKey | undefined) ?? PublicKey.default,
          escrowAccount:      (raw['escrowAccount'] as PublicKey | undefined) ?? PublicKey.default,
          playerStacks:       (raw['playerStacks'] as PublicKey[] | undefined) ?? Array(10).fill(PublicKey.default),
          playerBets:         (raw['playerBets'] as PublicKey[] | undefined) ?? Array(10).fill(PublicKey.default),
          currentBet:         toBigInt(raw['currentBet']),
          foldedBitmap:       Number(raw['foldedBitmap'] ?? 0),
          allInBitmap:        Number(raw['allInBitmap'] ?? 0),
          handVerifiedBitmap: Number(raw['handVerifiedBitmap'] ?? 0),
          smallBlind:         toBigInt(raw['smallBlind']),
          bigBlind:           toBigInt(raw['bigBlind']),
          handNumber:         Number(raw['handNumber'] ?? 0),
          lastActionTime:     toBigInt(raw['lastActionTime']),
          numPlayers:         Number(raw['numPlayers'] ?? 0),
          actedBitmap:        Number(raw['actedBitmap'] ?? 0),
          winnersBitmap:      Number(raw['winnersBitmap'] ?? 0),
          winnerCount:        Number(raw['winnerCount'] ?? 0),
          lastRaise:          toBigInt(raw['lastRaise']),
          potTotal:           toBigInt(raw['potTotal']),
          playerRoundBets:    ((raw['playerRoundBets'] as unknown[] | undefined) ?? []).map(toBigInt),
          bump:               Number(raw['bump'] ?? 0),
        } as PokerTable;
      } catch (err: any) {
        if (err?.message?.includes('Account does not exist')) return null;
        throw err;
      }
    },
    enabled: !!gameId && !!programs && !!pda,
    refetchInterval: 5_000,  // Poll every 5s as fallback
    staleTime: 2_000,
    retry: 1,
  });

  // WebSocket subscription — triggers immediate refetch on any account change
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

    return () => { connection.removeAccountChangeListener(subId); };
  }, [pda?.toBase58(), !!programs, gameId, queryClient]);

  return query;
}
