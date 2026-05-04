/**
 * Anchor Program Client Setup
 * 
 * Provides typed interfaces to interact with CerberusPoker programs
 */

import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet, AnchorWallet } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';

import cerberusPokerIdl from '../idl/cerberus_poker.json';
import texasHoldemIdl from '../idl/texas_holdem.json';

// Program IDs from Anchor.toml
export const CERBERUS_POKER_PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');
export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey('HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65');

// RPC endpoint - use environment variable or default to devnet
export const RPC_ENDPOINT = import.meta.env.VITE_RPC_URL || 'https://api.devnet.solana.com';

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
      CERBERUS_POKER_PROGRAM_ID,
      provider
    );

    const texasHoldem = new Program(
      texasHoldemIdl as Idl,
      TEXAS_HOLDEM_PROGRAM_ID,
      provider
    );

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
    [Buffer.from('game_session'), gameIdBuffer],
    CERBERUS_POKER_PROGRAM_ID
  );
}

export function derivePokerTablePDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('poker_table'), gameIdBuffer],
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
