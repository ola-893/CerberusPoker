/**
 * useDealtCard — fetches the DealtCard PDA for the current player's hole cards
 *
 * After MXE threshold decryption, the card_value (0-51) is stored on-chain.
 * The PDA seed is [b"dealt_card", game_id_le_bytes, player_index_byte].
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnchorPrograms, CERBERUS_POKER_PROGRAM_ID, getConnection } from '../lib/anchor';
import { DealtCard } from '../types';

/** Derive the DealtCard PDA for a specific player */
function deriveDealtCardPDA(gameId: bigint, playerIndex: number): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);

  return PublicKey.findProgramAddressSync(
    [Buffer.from('dealt_card'), gameIdBuffer, Buffer.from([playerIndex])],
    CERBERUS_POKER_PROGRAM_ID
  );
}

function parseDealtCard(raw: any, gameId: bigint): DealtCard {
  return {
    gameId,
    cardIndex:  raw.cardValue,   // IDL field is card_value (0-51)
    ciphertext: new Uint8Array(0),
    nonce:      new Uint8Array(0),
    bump:       raw.bump,
  };
}

export function useDealtCard(gameId: string | null, playerIndex: number | null) {
  const programs = useAnchorPrograms();
  const queryClient = useQueryClient();
  const { publicKey } = useWallet();

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

  const pda = (gameIdBigInt !== null && playerIndex !== null)
    ? deriveDealtCardPDA(gameIdBigInt, playerIndex)[0]
    : null;

  const query = useQuery({
    queryKey: ['dealtCard', gameId, playerIndex],
    queryFn: async (): Promise<DealtCard | null> => {
      if (!programs || !pda || gameIdBigInt === null || playerIndex === null) return null;

      try {
        const raw = await programs.cerberusPoker.account['dealtCard'].fetch(pda);
        return parseDealtCard(raw, gameIdBigInt);
      } catch (err: any) {
        // Cards not dealt yet
        if (err?.message?.includes('Account does not exist')) return null;
        throw err;
      }
    },
    enabled: !!programs && !!pda && playerIndex !== null,
    refetchInterval: false,
    staleTime: Infinity,
    retry: 1,
  });

  // Subscribe to updates (cards get revealed by MXE callback)
  useEffect(() => {
    if (!pda || !programs) return;

    const connection = getConnection();
    const subId = connection.onAccountChange(
      pda,
      () => {
        queryClient.invalidateQueries({ queryKey: ['dealtCard', gameId, playerIndex] });
      },
      'confirmed'
    );

    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [pda?.toBase58(), programs, gameId, playerIndex, queryClient]);

  return query;
}

/**
 * Extract hole card values from DealtCard accounts.
 * In Texas Hold'em each player gets 2 hole cards stored in separate PDAs
 * (playerIndex for card 1, playerIndex + maxPlayers for card 2).
 */
export function decryptHoleCards(
  card1: DealtCard | null,
  card2: DealtCard | null
): [number, number] | null {
  if (!card1 || !card2) return null;
  // card_value is already plaintext after MXE threshold decryption
  return [card1.cardIndex, card2.cardIndex];
}
