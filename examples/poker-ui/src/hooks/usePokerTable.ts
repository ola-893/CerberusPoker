/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { PokerTable, PokerPhase } from '../types';
import { derivePokerTablePDA, useAnchorPrograms } from '../lib/anchor';

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
 * Subscribe to PokerTable PDA account updates
 */
export function usePokerTable(gameId: string | null) {
  const programs = useAnchorPrograms();

  return useQuery({
    queryKey: ['pokerTable', gameId],
    queryFn: async () => {
      if (!gameId) return null;
      if (!programs) return null;

      const parsedGameId = parseGameId(gameId);
      const [pokerTablePda] = derivePokerTablePDA(parsedGameId);
      const account = await (programs.texasHoldem.account as any).pokerTable.fetch(pokerTablePda);
      const raw = account as Record<string, unknown>;

      return {
        gameSession: (raw['gameSession'] as PublicKey | undefined) ?? PublicKey.default,
        phase: decodeAnchorEnum<PokerPhase>(raw['phase'], PokerPhase.PreFlop),
        dealerIndex: Number(raw['dealerIndex'] ?? 0),
        currentPlayer: Number(raw['currentPlayer'] ?? 0),
        potMint: (raw['potMint'] as PublicKey | undefined) ?? PublicKey.default,
        potAccount: (raw['potAccount'] as PublicKey | undefined) ?? PublicKey.default,
        escrowAccount: (raw['escrowAccount'] as PublicKey | undefined) ?? PublicKey.default,
        playerStacks: (raw['playerStacks'] as PublicKey[] | undefined) ?? Array(10).fill(PublicKey.default),
        playerBets: (raw['playerBets'] as PublicKey[] | undefined) ?? Array(10).fill(PublicKey.default),
        currentBet: toBigInt(raw['currentBet']),
        foldedBitmap: Number(raw['foldedBitmap'] ?? 0),
        allInBitmap: Number(raw['allInBitmap'] ?? 0),
        handVerifiedBitmap: Number(raw['handVerifiedBitmap'] ?? 0),
        smallBlind: toBigInt(raw['smallBlind']),
        bigBlind: toBigInt(raw['bigBlind']),
        handNumber: Number(raw['handNumber'] ?? 0),
        lastActionTime: toBigInt(raw['lastActionTime']),
        numPlayers: Number(raw['numPlayers'] ?? 0),
        actedBitmap: Number(raw['actedBitmap'] ?? 0),
        winnersBitmap: Number(raw['winnersBitmap'] ?? 0),
        winnerCount: Number(raw['winnerCount'] ?? 0),
        lastRaise: toBigInt(raw['lastRaise']),
        potTotal: toBigInt(raw['potTotal']),
        playerRoundBets: ((raw['playerRoundBets'] as unknown[] | undefined) ?? []).map(toBigInt),
        bump: Number(raw['bump'] ?? 0),
      } as PokerTable;
    },
    enabled: !!gameId && !!programs,
    refetchInterval: false,
    staleTime: Infinity,
  });
}
