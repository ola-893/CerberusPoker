/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { GameSession, GameState } from '../types';

// Mock connection for now - replace with actual Solana connection
const connection = new Connection(clusterApiUrl('devnet'));

/**
 * Subscribe to GameSession PDA account updates
 */
export function useGameSession(gameId: string | null) {
  return useQuery({
    queryKey: ['gameSession', gameId],
    queryFn: async () => {
      if (!gameId) return null;
      
      // TODO: Replace with actual PDA derivation and account fetch
      // const [gameSessionPda] = PublicKey.findProgramAddressSync(
      //   [Buffer.from('game'), Buffer.from(gameId)],
      //   CERBERUS_POKER_PROGRAM_ID
      // );
      // const accountInfo = await connection.getAccountInfo(gameSessionPda);
      // return deserializeGameSession(accountInfo.data);
      
      // Mock data for now
      return {
        gameId: BigInt(gameId),
        state: GameState.Active,
        maxPlayers: 6,
        deckSize: 52,
        numPlayers: 4,
        players: [] as PublicKey[],
        activeComputationOffset: BigInt(0),
        encryptedDeckHash: new Uint8Array(32),
        shuffleBitmap: 0b1111, // all 4 players shuffled
        revealBitmap: [BigInt(0b11111)], // 5 community cards revealed
        unmaskedCards: Array(52).fill(0xff),
        cardAssignedTo: Array(52).fill(0xfe),
        cardValueUsed: [BigInt(0)],
        createdAt: BigInt(Date.now() / 1000),
        shuffleDeadline: BigInt(0),
        revealDeadline: BigInt(0),
        bump: 0,
      } as GameSession;
    },
    enabled: !!gameId,
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
