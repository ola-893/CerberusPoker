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
import { PROGRAM_IDS } from '../constants';

export type AnchorProgramClient = Omit<Program<Idl>, 'methods' | 'provider'> & {
  methods: any;
  provider: AnchorProvider;
};

// Program IDs from the deployed devnet programs.
export const CERBERUS_POKER_PROGRAM_ID = new PublicKey(PROGRAM_IDS.CERBERUS_POKER);
export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey(PROGRAM_IDS.TEXAS_HOLDEM);

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

    // Patch the instruction coder buffer size.
    // Anchor's BorshInstructionCoder.encode() hardcodes Buffer.alloc(1000)
    // but our deck ciphertext instructions need ~1736 bytes.
    patchInstructionCoder(cerberusPoker);
    patchInstructionCoder(texasHoldem);

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
    [Buffer.from('game'), gameIdBuffer],
    CERBERUS_POKER_PROGRAM_ID
  );
}

export function derivePokerTablePDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('table'), gameIdBuffer],
    TEXAS_HOLDEM_PROGRAM_ID
  );
}

export function deriveDealtCardPDA(
  gameSession: PublicKey,
  playerIndex: number,
  cardIndex: number
): [PublicKey, number] {
  const playerIndexBuffer = Buffer.from([playerIndex]);
  const cardIndexBuffer = Buffer.from([cardIndex]);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dealt_card'), gameSession.toBuffer(), playerIndexBuffer, cardIndexBuffer],
    CERBERUS_POKER_PROGRAM_ID
  );
}

/**
 * Get connection instance
 */
export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, 'confirmed');
}

/**
 * Monkey-patch Anchor's instruction coder to use a larger encode buffer.
 *
 * Anchor's BorshInstructionCoder.encode() allocates a fixed 1000-byte buffer,
 * but our instructions carry [[u8;32];52] ciphertext arrays (~1736 bytes).
 * This replaces the encode method in-place so the entire Anchor method-builder
 * chain works transparently with a 4096-byte buffer.
 */
function patchInstructionCoder(program: AnchorProgramClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coder = (program as any).coder?.instruction;
  if (!coder || !coder.encode) return;

  const originalEncode = coder.encode.bind(coder);

  coder.encode = function patchedEncode(ixName: string, ix: Record<string, unknown>) {
    // Access the layout map that BorshInstructionCoder stores internally
    const encoder = this.ixLayouts?.get(ixName);
    if (!encoder) {
      // Fall back to original for unknown methods
      return originalEncode(ixName, ix);
    }

    const buffer = Buffer.alloc(4096);
    const len = encoder.layout.encode(ix, buffer);
    const data = buffer.slice(0, len);
    return Buffer.concat([Buffer.from(encoder.discriminator), data]);
  };
}
