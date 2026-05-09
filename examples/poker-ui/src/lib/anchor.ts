/**
 * Anchor Program Client Setup
 * 
 * Provides typed interfaces to interact with CerberusPoker programs
 */

import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { useWallet, AnchorWallet } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';

import cerberusPokerIdl from '../idl/cerberus_poker.json';
import texasHoldemIdl from '../idl/texas_holdem.json';

export type AnchorProgramClient = Omit<Program<Idl>, 'methods' | 'provider'> & {
  methods: any;
  provider: AnchorProvider;
};

// Program IDs from Anchor.toml
export const CERBERUS_POKER_PROGRAM_ID = new PublicKey('4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG');
export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey('h9xwoEpELRp4tUExQDpyjg2cfzvEUL53wy76sUZWok9');

// RPC endpoint - use environment variable or default to devnet
export const RPC_ENDPOINT = import.meta.env['VITE_RPC_URL'] || clusterApiUrl('devnet');

/**
 * Hook to get Anchor program instances
 * Returns typed program interfaces for both CerberusPoker programs
 */
export function useAnchorPrograms() {
  const wallet = useWallet();
  
  const programs = useMemo(() => {
    if (!wallet.publicKey) {
      return null;
    }

    // Create connection
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    
    // Create provider
    const provider = new AnchorProvider(
      connection,
      wallet as AnchorWallet,
      { commitment: 'confirmed' }
    );

    // Initialize programs
    const cerberusPoker = new Program(
      cerberusPokerIdl as Idl,
      provider
    ) as unknown as AnchorProgramClient;

    const texasHoldem = new Program(
      texasHoldemIdl as Idl,
      provider
    ) as unknown as AnchorProgramClient;

    return {
      cerberusPoker,
      texasHoldem,
      provider,
      connection,
    };
  }, [wallet.publicKey, wallet]);

  return programs;
}

/**
 * Derive PDA addresses for game accounts
 */
export function deriveGameSessionPDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game'), gameIdBuffer],   // seed: b"game"
    CERBERUS_POKER_PROGRAM_ID
  );
}

export function derivePokerTablePDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('table'), gameIdBuffer],  // seed: b"table"
    TEXAS_HOLDEM_PROGRAM_ID
  );
}

export function deriveDealtCardPDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dealt_card'), gameIdBuffer, Buffer.from([0])],
    CERBERUS_POKER_PROGRAM_ID
  );
}

/**
 * Get connection instance
 */
export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, 'confirmed');
}
