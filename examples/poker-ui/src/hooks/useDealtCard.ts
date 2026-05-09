/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { DealtCard, GameSession } from '../types';
import { deriveDealtCardPDA, deriveGameSessionPDA, useAnchorPrograms } from '../lib/anchor';

function parseGameId(gameId: string): bigint {
  if (/^[0-9a-fA-F]+$/.test(gameId) && /[a-fA-F]/.test(gameId)) {
    return BigInt(`0x${gameId}`);
  }
  return BigInt(gameId);
}

/**
 * Fetch the current player's dealt card PDAs.
 */
export function useDealtCards(
  gameId: string | null,
  gameSession: GameSession | null | undefined,
  playerIndex: number | null
) {
  const programs = useAnchorPrograms();

  return useQuery({
    queryKey: ['dealtCards', gameId, playerIndex, gameSession?.cardAssignedTo.join(',')],
    queryFn: async () => {
      if (!gameId || !gameSession || !programs || playerIndex === null || playerIndex < 0) {
        return null;
      }

      const parsedGameId = parseGameId(gameId);
      const [gameSessionPda] = deriveGameSessionPDA(parsedGameId);
      const cardIndices = gameSession.cardAssignedTo
        .map((assignedTo, cardIndex) => ({ assignedTo, cardIndex }))
        .filter(({ assignedTo }) => assignedTo === playerIndex)
        .slice(0, 2);

      if (cardIndices.length === 0) {
        return [];
      }

      const fetched = await Promise.all(
        cardIndices.map(async ({ cardIndex }) => {
          const [dealtCardPda] = deriveDealtCardPDA(gameSessionPda, playerIndex, cardIndex);
          try {
            const account = await (programs.cerberusPoker.account as any).dealtCard.fetch(dealtCardPda);
            const raw = account as Record<string, unknown>;
            return {
              gameId: BigInt(raw['gameId']?.toString() ?? gameId),
              cardIndex: Number(raw['cardIndex'] ?? cardIndex),
              playerIndex: Number(raw['playerIndex'] ?? playerIndex),
              cardValue: Number(raw['cardValue'] ?? 0xff),
              bump: Number(raw['bump'] ?? 0),
            } as DealtCard;
          } catch {
            return null;
          }
        })
      );

      return fetched.filter((card): card is DealtCard => card !== null);
    },
    enabled: !!gameId && !!gameSession && !!programs && playerIndex !== null && playerIndex >= 0,
    refetchInterval: false,
    staleTime: Infinity,
  });
}

/**
 * Convert the player's dealt card accounts into renderable hole-card values.
 */
export function decryptHoleCards(dealtCards: DealtCard[] | null): [number, number] | null {
  if (!dealtCards || dealtCards.length < 2) return null;

  const sortedCards = [...dealtCards].sort((a, b) => a.cardIndex - b.cardIndex);
  const first = sortedCards[0]?.cardValue;
  const second = sortedCards[1]?.cardValue;
  if (first === undefined || second === undefined || first >= 52 || second >= 52) {
    return null;
  }

  return [first, second];
}
