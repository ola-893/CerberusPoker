/**
 * Shared TypeScript types for CerberusPoker SDK
 */

import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';

/**
 * Wallet adapter interface compatible with Phantom and Backpack
 */
export interface AnchorWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/**
 * Configuration for CerberusPokerSDK initialization
 */
export interface SDKConfig {
  /** Solana RPC connection */
  connection: Connection;
  
  /** Wallet adapter (Phantom, Backpack, etc.) */
  wallet: AnchorWallet;
  
  /** CerberusPoker protocol program ID */
  cerberusProgramId?: PublicKey;

  /** Texas Hold'em reference program ID */
  texasHoldemProgramId?: PublicKey;

  /** Backward-compatible alias for cerberusProgramId */
  programId?: PublicKey;

  /** Optional CerberusPoker IDL. If omitted, the SDK fetches it from-chain. */
  cerberusIdl?: Idl;

  /** Optional Texas Hold'em IDL. If omitted, the SDK fetches it from-chain. */
  texasHoldemIdl?: Idl;
  
  /** Arcium cluster offset (devnet: 456 for the 0.4.x-compatible deployment) */
  clusterOffset: number;

  /** Optional preloaded Arcium environment/client object. */
  arciumEnv?: unknown;
  
  /** Optional: C-SPL token mint for wagering */
  cSplMint?: PublicKey;
}

/**
 * Game state enum matching on-chain GameState
 */
export enum GameState {
  Lobby = 'Lobby',
  Shuffle = 'Shuffle',
  Deal = 'Deal',
  Active = 'Active',
  Showdown = 'Showdown',
  Complete = 'Complete',
}

/**
 * Poker phase enum matching on-chain PokerPhase
 */
export enum PokerPhase {
  PreFlop = 'PreFlop',
  Flop = 'Flop',
  Turn = 'Turn',
  River = 'River',
  Showdown = 'Showdown',
  Complete = 'Complete',
}

/**
 * Player action enum matching on-chain Action
 */
export enum Action {
  Fold = 'Fold',
  Check = 'Check',
  Call = 'Call',
  Raise = 'Raise',
  AllIn = 'AllIn',
}

/**
 * Hand rank enum matching on-chain HandRank
 */
export enum HandRank {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

/**
 * Revealed card information
 */
export interface RevealedCard {
  /** Card index in the deck (0-51) */
  cardIndex: number;
  
  /** Card value (0-51: suit = value/13, rank = value%13) */
  cardValue: number;
  
  /** Timestamp when revealed */
  revealedAt: number;
}

/**
 * Betting action event
 */
export interface BettingEvent {
  /** Player index who acted */
  playerIndex: number;
  
  /** Action taken */
  action: Action;
  
  /** Amount (for Raise/Call) */
  amount?: bigint;
  
  /** Timestamp of action */
  timestamp: number;
}

/**
 * Game session state
 */
export interface GameSession {
  /** Game ID */
  gameId: bigint;
  
  /** Current game state */
  state: GameState;
  
  /** Maximum players */
  maxPlayers: number;
  
  /** Current number of players */
  numPlayers: number;
  
  /** Player public keys */
  players: PublicKey[];
  
  /** MXE session ID */
  mxeSessionId: Uint8Array;
  
  /** Encrypted deck hash */
  encryptedDeckHash: Uint8Array;
  
  /** Shuffle bitmap (which players have shuffled) */
  shuffleBitmap: number;

  /** Active Arcium computation offset */
  activeComputationOffset: bigint;
  
  /** Reveal bitmap per card */
  revealBitmap: bigint[];
  
  /** Unmasked card values */
  unmaskedCards: number[];
  
  /** Card assignments (player index or 0xFF for community) */
  cardAssignedTo: number[];

  /** Used-card bitmap */
  cardValueUsed: bigint[];
  
  /** Creation timestamp */
  createdAt: bigint;
  
  /** Shuffle deadline */
  shuffleDeadline: bigint;
  
  /** Reveal deadline */
  revealDeadline: bigint;

  /** Pending reveal card index, or 0xFE when idle */
  pendingRevealCardIndex: number;

  /** Pending private deal card index, or 0xFE when idle */
  pendingDealCardIndex: number;

  /** Pending private deal player index, or 0xFE when idle */
  pendingDealPlayerIndex: number;
}

/**
 * Poker table state
 */
export interface PokerTable {
  /** Reference to GameSession PDA */
  gameSession: PublicKey;
  
  /** Current poker phase */
  phase: PokerPhase;
  
  /** Dealer index */
  dealerIndex: number;
  
  /** Current player index */
  currentPlayer: number;
  
  /** Pot mint (C-SPL token) */
  potMint: PublicKey;
  
  /** Pot account */
  potAccount: PublicKey;
  
  /** Escrow account (USDC+) */
  escrowAccount: PublicKey;
  
  /** Player stack accounts */
  playerStacks: PublicKey[];
  
  /** Player bet accounts */
  playerBets: PublicKey[];
  
  /** Current bet amount */
  currentBet: bigint;
  
  /** Folded bitmap */
  foldedBitmap: number;
  
  /** All-in bitmap */
  allInBitmap: number;
  
  /** Hand verified bitmap */
  handVerifiedBitmap: number;
  
  /** Small blind */
  smallBlind: bigint;
  
  /** Big blind */
  bigBlind: bigint;
  
  /** Hand number */
  handNumber: number;
  
  /** Last action timestamp */
  lastActionTime: bigint;

  /** Number of players seated in the current hand */
  numPlayers: number;

  /** Players who have acted in this betting round */
  actedBitmap: number;

  /** Last committed showdown winners */
  winnersBitmap: number;

  /** Number of winners in winnersBitmap */
  winnerCount: number;

  /** Minimum raise basis for standard Hold'em betting */
  lastRaise: bigint;

  /** Phase 1 plaintext escrow total */
  potTotal: bigint;

  /** Current betting-round contribution per player */
  playerRoundBets: bigint[];
}

/**
 * Unsubscribe function for event listeners
 */
export type Unsubscribe = () => void;

/**
 * Transaction confirmation strategy
 */
export interface ConfirmOptions {
  /** Skip preflight checks */
  skipPreflight?: boolean;
  
  /** Commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized';
  
  /** Max retries */
  maxRetries?: number;
}
