/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { PokerTable, PokerPhase } from '../types';

const connection = new Connection('https://api.devnet.solana.com');

/**
 * Subscribe to PokerTable PDA account updates
 */
export function usePokerTable(gameId: string | null) {
  return useQuery({
    queryKey: ['pokerTable', gameId],
    queryFn: async () => {
      if (!gameId) return null;
      
      // TODO: Replace with actual PDA derivation and account fetch
      // const [pokerTablePda] = PublicKey.findProgramAddressSync(
      //   [Buffer.from('poker_table'), gameSessionPda.toBuffer()],
      //   TEXAS_HOLDEM_PROGRAM_ID
      // );
      // const accountInfo = await connection.getAccountInfo(pokerTablePda);
      // return deserializePokerTable(accountInfo.data);
      
      // Mock data for now
      return {
        gameSession: PublicKey.default,
        phase: PokerPhase.Flop,
        dealerIndex: 0,
        currentPlayer: 1,
        potMint: PublicKey.default,
        potAccount: PublicKey.default,
        escrowAccount: PublicKey.default,
        playerStacks: Array(10).fill(PublicKey.default),
        playerBets: Array(10).fill(PublicKey.default),
        currentBet: BigInt(200), // 2 USDC+ in lamports
        foldedBitmap: 0b0100, // player 2 folded
        allInBitmap: 0b0000,
        handVerifiedBitmap: 0b0000,
        smallBlind: BigInt(100),
        bigBlind: BigInt(200),
        handNumber: 1,
        bump: 0,
      } as PokerTable;
    },
    enabled: !!gameId,
    refetchInterval: false,
    staleTime: Infinity,
  });
}
