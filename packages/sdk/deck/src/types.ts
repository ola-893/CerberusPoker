/**
 * @cerberus-poker/deck - Type definitions for the deck module
 * 
 * Types for encrypted deck operations: shuffle, deal, reveal, and showdown
 * via the Arcium MXE (Multi-party eXecution Environment).
 */

import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

// ============================================================================
// Wallet Types
// ============================================================================

/**
 * Wallet interface compatible with Anchor and Solana wallet adapters
 */
export interface AnchorWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

// ============================================================================
// Deck Module Configuration
// ============================================================================

/**
 * Configuration for the DeckModule
 */
export interface DeckModuleConfig {
  /** Solana connection */
  connection: Connection;

  /** User's wallet */
  wallet: AnchorWallet;

  /** CerberusPoker program instance */
  cerberusProgram: Program;

  /** Arcium MXE program ID */
  mxeProgramId: PublicKey;

  /** Arcium cluster offset (456 for devnet) */
  clusterOffset: number;
}

// ============================================================================
// Shuffle Types
// ============================================================================

/**
 * Shuffle contribution from a player
 * 
 * Each player contributes a permutation that is encrypted with x25519
 * and sent to the MXE for combining. The MXE shuffles the deck using
 * all contributions, ensuring no single player can control the order.
 */
export interface ShuffleContribution {
  /** Game ID */
  gameId: bigint;

  /** Player's permutation (encrypted) */
  encryptedPermutation: Uint8Array;

  /** x25519 ephemeral public key for this contribution */
  ephemeralPubkey: Uint8Array;

  /** Computation offset for MXE tracking */
  computationOffset: bigint;
}

/**
 * Result of a shuffle computation
 */
export interface ShuffleResult {
  /** Whether the shuffle was successful */
  success: boolean;

  /** Transaction signature */
  signature: string;

  /** Computation offset used */
  computationOffset: bigint;

  /** Encrypted deck hash after shuffle */
  deckHash?: Uint8Array;
}

// ============================================================================
// Deal Types
// ============================================================================

/**
 * A card dealt to a specific player via threshold decryption
 * 
 * The MXE performs threshold decryption so only the recipient
 * can see the card value. The ciphertext is Enc<Shared, u8>.
 */
export interface DealtCard {
  /** Card index in the deck (0-51) */
  cardIndex: number;

  /** Player index who received this card */
  playerIndex: number;

  /** Encrypted card value (only recipient can decrypt) */
  ciphertext: Uint8Array;

  /** Nonce used for x25519 encryption */
  nonce: Uint8Array;
}

/**
 * Result of a deal computation
 */
export interface DealResult {
  /** Whether the deal was successful */
  success: boolean;

  /** Transaction signature */
  signature: string;

  /** Computation offset used */
  computationOffset: bigint;
}

// ============================================================================
// Reveal Types
// ============================================================================

/**
 * Result of a community card reveal
 */
export interface RevealResult {
  /** Whether the reveal was successful */
  success: boolean;

  /** Transaction signature */
  signature: string;

  /** Computation offset used */
  computationOffset: bigint;

  /** Revealed card value (0-51), available after callback */
  cardValue?: number;
}

// ============================================================================
// Computation Types
// ============================================================================

/**
 * Status of an MXE computation
 */
export enum ComputationStatus {
  /** Computation is queued */
  Queued = 'Queued',

  /** Computation is being processed */
  Processing = 'Processing',

  /** Computation completed successfully */
  Completed = 'Completed',

  /** Computation failed */
  Failed = 'Failed',

  /** Computation timed out */
  TimedOut = 'TimedOut',
}

/**
 * Result of polling for a computation
 */
export interface ComputationResult<T = any> {
  /** Current status */
  status: ComputationStatus;

  /** Output data (if completed) */
  output?: T;

  /** Error message (if failed) */
  error?: string;

  /** Transaction signature of the callback */
  callbackSignature?: string;
}

// ============================================================================
// Card Utility Types
// ============================================================================

/**
 * Card encoding: value 0-51
 * Suit = Math.floor(value / 13): 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades
 * Rank = value % 13: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
 */
export type CardValue = number;

/** Card suit */
export enum Suit {
  Clubs = 0,
  Diamonds = 1,
  Hearts = 2,
  Spades = 3,
}

/** Card rank */
export enum Rank {
  Two = 0,
  Three = 1,
  Four = 2,
  Five = 3,
  Six = 4,
  Seven = 5,
  Eight = 6,
  Nine = 7,
  Ten = 8,
  Jack = 9,
  Queen = 10,
  King = 11,
  Ace = 12,
}

/**
 * Decoded card with human-readable suit and rank
 */
export interface DecodedCard {
  /** Original card value (0-51) */
  value: CardValue;

  /** Card suit */
  suit: Suit;

  /** Card rank */
  rank: Rank;

  /** Human-readable name (e.g., "Ace of Spades") */
  name: string;
}

/**
 * Arcium MXE account addresses required for queue_computation
 */
export interface ArciumAccounts {
  signPdaAccount: PublicKey;
  mxeAccount: PublicKey;
  mempoolAccount: PublicKey;
  executingPool: PublicKey;
  computationAccount: PublicKey;
  compDefAccount: PublicKey;
  clusterAccount: PublicKey;
  poolAccount: PublicKey;
  clockAccount: PublicKey;
  addressLookupTable: PublicKey;
  lutProgram: PublicKey;
  systemProgram: PublicKey;
  arciumProgram: PublicKey;
}
