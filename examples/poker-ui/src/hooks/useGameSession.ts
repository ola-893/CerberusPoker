/**
 * useGameSession — fetches and subscribes to the GameSession PDA on-chain
 * Uses WebSocket account subscription for real-time updates.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { GameSession, GameState } from '../types';
import { deriveGameSessionPDA, useAnchorPrograms, getConnection } from '../lib/anchor';

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

export function useGameSession(gameId: string | null) {
  const programs = useAnchorPrograms();
  const queryClient = useQueryClient();

  const gameIdBigInt = gameId ? (() => {
    try { return parseGameId(gameId); } catch { return null; }
  })() : null;

  const pda = gameIdBigInt !== null
    ? deriveGameSessionPDA(gameIdBigInt)[0]
    : null;

  const query = useQuery({
    queryKey: ['gameSession', gameId],
    queryFn: async (): Promise<GameSession | null> => {
      if (!gameId || !programs || !pda) return null;

      try {
        const account = await (programs.cerberusPoker.account as any).gameSession.fetch(pda);
        const raw = account as Record<string, unknown>;

        return {
          gameId: toBigInt(raw['gameId']),
          state: decodeAnchorEnum<GameState>(raw['state'], GameState.Lobby),
          maxPlayers: Number(raw['maxPlayers'] ?? 0),
          deckSize: Number(raw['deckSize'] ?? 52),
          numPlayers: Number(raw['numPlayers'] ?? 0),
          players: (raw['players'] as PublicKey[] | undefined) ?? [],
          activeComputationOffset: toBigInt(raw['activeComputationOffset']),
          encryptedDeckHash: Uint8Array.from((raw['encryptedDeckHash'] as number[] | undefined) ?? []),
          shuffleBitmap: Number(raw['shuffleBitmap'] ?? 0),
          revealBitmap: ((raw['revealBitmap'] as unknown[] | undefined) ?? []).map(toBigInt),
          unmaskedCards: ((raw['unmaskedCards'] as number[] | undefined) ?? []).map(Number),
          cardAssignedTo: ((raw['cardAssignedTo'] as number[] | undefined) ?? []).map(Number),
          cardValueUsed: ((raw['cardValueUsed'] as unknown[] | undefined) ?? []).map(toBigInt),
          createdAt: toBigInt(raw['createdAt']),
          shuffleDeadline: toBigInt(raw['shuffleDeadline']),
          revealDeadline: toBigInt(raw['revealDeadline']),
          pendingRevealCardIndex: Number(raw['pendingRevealCardIndex'] ?? 0xfe),
          pendingDealCardIndex: Number(raw['pendingDealCardIndex'] ?? 0xfe),
          pendingDealPlayerIndex: Number(raw['pendingDealPlayerIndex'] ?? 0xfe),
          bump: Number(raw['bump'] ?? 0),
        } as GameSession;
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
        // Invalidate so TanStack Query refetches immediately
        queryClient.invalidateQueries({ queryKey: ['gameSession', gameId] });
      },
      'confirmed'
    );

    return () => { connection.removeAccountChangeListener(subId); };
  }, [pda?.toBase58(), !!programs, gameId, queryClient]);

  return query;
}
