/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { DealtCard } from '../types';

const connection = new Connection('https://api.devnet.solana.com');

/**
 * Subscribe to DealtCard PDA for the current player's hole cards
 * Note: The seed is hardcoded to [0u8] in the backend, not the card index
 */
export function useDealtCard(gameId: string | null) {
  return useQuery({
    queryKey: ['dealtCard', gameId],
    queryFn: async () => {
      if (!gameId) return null;
      
      // TODO: Replace with actual PDA derivation and account fetch
      // const [dealtCardPda] = PublicKey.findProgramAddressSync(
      //   [Buffer.from('dealt_card'), Buffer.from(gameId), Buffer.from([0])],
      //   CERBERUS_POKER_PROGRAM_ID
      // );
      // const accountInfo = await connection.getAccountInfo(dealtCardPda);
      // return deserializeDealtCard(accountInfo.data);
      
      // Mock data for now
      return {
        gameId: BigInt(gameId),
        cardIndex: 0,
        ciphertext: new Uint8Array(32), // Encrypted card data
        nonce: new Uint8Array(24),
        bump: 0,
      } as DealtCard;
    },
    enabled: !!gameId,
    refetchInterval: false,
    staleTime: Infinity,
  });
}

/**
 * Decrypt hole cards from DealtCard PDA
 * TODO: Implement actual MXE decryption
 */
export function decryptHoleCards(dealtCard: DealtCard | null): [number, number] | null {
  if (!dealtCard) return null;
  
  // Mock decryption - return Ace of Spades and Ace of Clubs
  return [51, 39];
}
