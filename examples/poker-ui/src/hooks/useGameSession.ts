/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { GameSession, GameState } from '../types';
import { deriveGameSessionPDA, useAnchorPrograms } from '../lib/anchor';

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

/**
 * Subscribe to GameSession PDA account updates
 */
export function useGameSession(gameId: string | null) {
  const programs = useAnchorPrograms();

  return useQuery({
    queryKey: ['gameSession', gameId],
    queryFn: async () => {
      if (!gameId) return null;
      if (!programs) return null;

      const parsedGameId = parseGameId(gameId);
      const [gameSessionPda] = deriveGameSessionPDA(parsedGameId);
      const account = await (programs.cerberusPoker.account as any).gameSession.fetch(gameSessionPda);
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
    },
    enabled: !!gameId && !!programs,
    refetchInterval: false, // Use websocket subscription instead
    staleTime: Infinity,
  });
}

/**
 * Set up websocket subscription for real-time GameSession updates
 */
export function useGameSessionSubscription(gameId: string | null) {
  // TODO: Implement websocket subscription
  // useEffect(() => {
  //   if (!gameId) return;
  //   const subscriptionId = connection.onAccountChange(
  //     gameSessionPda,
  //     (accountInfo) => {
  //       queryClient.setQueryData(['gameSession', gameId], deserializeGameSession(accountInfo.data));
  //     }
  //   );
  //   return () => connection.removeAccountChangeListener(subscriptionId);
  // }, [gameId]);
}
