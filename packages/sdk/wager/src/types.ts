/**
 * @cerberus-poker/wager - Type definitions for the wager module
 * 
 * This file contains all TypeScript types for confidential betting operations,
 * including card types, encryption types, and wager-specific structures.
 */

import {
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

// ============================================================================
// Wallet and Provider Types
// ============================================================================

/**
 * Wallet interface compatible with Anchor and Solana wallet adapters
 * 
 * This interface is compatible with Phantom, Backpack, and other standard
 * Solana wallet adapters.
 * 
 * @example
 * ```typescript
 * import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
 * 
 * const adapter = new PhantomWalletAdapter();
 * await adapter.connect();
 * 
 * const wallet: AnchorWallet = {
 *   publicKey: adapter.publicKey!,
 *   signTransaction: adapter.signTransaction.bind(adapter),
 *   signAllTransactions: adapter.signAllTransactions.bind(adapter),
 * };
 * ```
 */
export interface AnchorWallet {
  /** The wallet's public key */
  publicKey: PublicKey;
  
  /**
   * Sign a single transaction
   * @param tx - Transaction to sign
   * @returns Signed transaction
   */
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  
  /**
   * Sign multiple transactions
   * @param txs - Array of transactions to sign
   * @returns Array of signed transactions
   */
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

// ============================================================================
// Card Types
// ============================================================================

/**
 * A card value in the deck (0-51)
 * 
 * Card encoding:
 * - Suit = Math.floor(cardValue / 13)
 *   - 0 = Clubs, 1 = Diamonds, 2 = Hearts, 3 = Spades
 * - Rank = cardValue % 13
 *   - 0 = 2, 1 = 3, ..., 8 = 10, 9 = Jack, 10 = Queen, 11 = King, 12 = Ace
 * 
 * @example
 * ```typescript
 * const aceOfSpades: Card = 51; // (3 * 13) + 12
 * const twoOfClubs: Card = 0;   // (0 * 13) + 0
 * ```
 */
export type Card = number;

/**
 * Encrypted card using ElGamal encryption on an elliptic curve
 * 
 * ElGamal ciphertext consists of two curve points:
 * - C1 = r * G (ephemeral key)
 * - C2 = card*G + r*APK (message component)
 * 
 * Where:
 * - G is the generator point
 * - r is a random scalar
 * - APK is the aggregated public key (sum of all players' public keys)
 * - card is the plaintext card value
 * 
 * @see https://en.wikipedia.org/wiki/ElGamal_encryption
 */
export interface EncryptedCard {
  /**
   * C1 component (ephemeral key): r * G
   * 32-byte compressed elliptic curve point
   */
  c1: Uint8Array;
  
  /**
   * C2 component (message): card*G + r*APK
   * 32-byte compressed elliptic curve point
   */
  c2: Uint8Array;
}

/**
 * A card that has been dealt to a specific player
 * 
 * After the MXE performs threshold decryption, the card is encrypted
 * specifically for the recipient using Enc<Shared, u8>. Only the recipient
 * can decrypt this card using their private key.
 */
export interface DealtCard {
  /** Game ID this card belongs to */
  gameId: bigint;
  
  /** Card index in the deck (0-51) */
  cardIndex: number;
  
  /** Player index who received this card (0-9) */
  playerIndex: number;
  
  /** Encrypted card value (only recipient can decrypt) */
  ciphertext: Uint8Array;
  
  /** Nonce used for encryption */
  nonce: Uint8Array;
  
  /** Timestamp when the card was dealt */
  dealtAt: bigint;
}

/**
 * A card that has been revealed publicly
 * 
 * Community cards are revealed via multi-party computation where all
 * active players contribute reveal tokens. The MXE aggregates these
 * tokens and produces the plaintext card value with an attestation.
 */
export interface RevealedCard {
  /** Game ID this card belongs to */
  gameId: bigint;
  
  /** Card index in the deck (0-51) */
  cardIndex: number;
  
  /** Plaintext card value (0-51) */
  cardValue: Card;
  
  /** Timestamp when the card was revealed */
  revealedAt: bigint;
  
  /** MXE attestation proving the reveal is valid */
  attestation?: MxeAttestation;
}

/**
 * MXE attestation for cryptographic verification
 * 
 * All card reveals and showdown results are accompanied by an MXE attestation
 * that proves the computation was performed correctly by the Arcium MPC cluster.
 */
export interface MxeAttestation {
  /** MXE session ID this attestation belongs to */
  sessionId: Uint8Array;
  
  /** Computation offset (unique ID for this computation) */
  computationOffset: bigint;
  
  /** Signature from the MXE cluster */
  signature: Uint8Array;
  
  /** Timestamp of the attestation */
  timestamp: bigint;
}

// ============================================================================
// Game State Types
// ============================================================================

/**
 * Game state enum matching on-chain GameState
 * 
 * The game progresses through these states in order:
 * Lobby → Shuffle → Deal → Active → Showdown → Complete
 */
export enum GameState {
  /** Players are joining the game */
  Lobby = 'Lobby',
  
  /** Players are shuffling the deck via MPC */
  Shuffle = 'Shuffle',
  
  /** Cards are being dealt to players */
  Deal = 'Deal',
  
  /** Game is in progress (betting rounds) */
  Active = 'Active',
  
  /** Final showdown - revealing hands and determining winner */
  Showdown = 'Showdown',
  
  /** Game has ended */
  Complete = 'Complete',
}

/**
 * Poker phase enum matching on-chain PokerPhase
 * 
 * Texas Hold'em progresses through these betting rounds:
 * PreFlop → Flop → Turn → River → Showdown
 */
export enum PokerPhase {
  /** Before flop (2 hole cards dealt) */
  PreFlop = 'PreFlop',
  
  /** After flop (3 community cards revealed) */
  Flop = 'Flop',
  
  /** After turn (4th community card revealed) */
  Turn = 'Turn',
  
  /** After river (5th community card revealed) */
  River = 'River',
  
  /** Final showdown */
  Showdown = 'Showdown',
}

// ============================================================================
// Betting Types
// ============================================================================

/**
 * Player action enum matching on-chain Action
 * 
 * These are the standard poker actions available during betting rounds.
 */
export enum Action {
  /** Exit the hand and forfeit any bets */
  Fold = 'Fold',
  
  /** Pass the action without betting (only valid if no bet to call) */
  Check = 'Check',
  
  /** Match the current bet */
  Call = 'Call',
  
  /** Increase the current bet */
  Raise = 'Raise',
  
  /** Bet all remaining chips */
  AllIn = 'AllIn',
}

/**
 * Betting action event
 * 
 * Emitted when a player takes an action during a betting round.
 */
export interface BettingEvent {
  /** Game ID */
  gameId: bigint;
  
  /** Player index who acted (0-9) */
  playerIndex: number;
  
  /** Action taken */
  action: Action;
  
  /** Amount (for Raise/Call/AllIn) - encrypted on-chain */
  amount?: bigint;
  
  /** Minimum bet amount (plaintext, for UI display) */
  minBet?: bigint;
  
  /** Timestamp of action */
  timestamp: bigint;
  
  /** Current poker phase when action was taken */
  phase: PokerPhase;
}

// ============================================================================
// Hand Evaluation Types
// ============================================================================

/**
 * Hand rank enum matching on-chain HandRank
 * 
 * Standard poker hand rankings from lowest (0) to highest (9).
 */
export enum HandRank {
  /** No pair - highest card wins */
  HighCard = 0,
  
  /** Two cards of the same rank */
  Pair = 1,
  
  /** Two different pairs */
  TwoPair = 2,
  
  /** Three cards of the same rank */
  ThreeOfAKind = 3,
  
  /** Five cards in sequence */
  Straight = 4,
  
  /** Five cards of the same suit */
  Flush = 5,
  
  /** Three of a kind + a pair */
  FullHouse = 6,
  
  /** Four cards of the same rank */
  FourOfAKind = 7,
  
  /** Five cards in sequence, all same suit */
  StraightFlush = 8,
  
  /** A-K-Q-J-10 all same suit */
  RoyalFlush = 9,
}

/**
 * Evaluated poker hand
 * 
 * Result of evaluating a 7-card hand (2 hole + 5 community) to find
 * the best 5-card poker hand.
 */
export interface EvaluatedHand {
  /** Player index */
  playerIndex: number;
  
  /** Hand rank */
  rank: HandRank;
  
  /** Tiebreaker value (higher is better) */
  tiebreaker: number;
  
  /** The 5 cards that make up the best hand */
  cards: Card[];
  
  /** Human-readable description (e.g., "Pair of Aces") */
  description: string;
}

/**
 * Showdown result
 * 
 * Result of the final showdown, including all revealed hands and the winner.
 */
export interface ShowdownResult {
  /** Game ID */
  gameId: bigint;
  
  /** All revealed hands (non-folded players) */
  hands: EvaluatedHand[];
  
  /** Winner's player index */
  winnerIndex: number;
  
  /** Pot amount awarded to winner */
  potAmount: bigint;
  
  /** Whether the pot was split (tie) */
  isSplit: boolean;
  
  /** If split, the indices of all winners */
  splitWinners?: number[];
  
  /** Timestamp of showdown */
  timestamp: bigint;
}

// ============================================================================
// Encryption and Privacy Types
// ============================================================================

/**
 * Encrypted balance structure
 * 
 * Player balances and bet amounts are encrypted via the Arcium MXE
 * to hide them from all observers. Only the MXE can decrypt these values
 * before showdown.
 */
export interface EncryptedBalance {
  /** Ciphertext of the balance (Enc<Mxe, u64>) */
  ciphertext: Uint8Array;
  
  /** Nonce used for encryption */
  nonce: Uint8Array;
  
  /** Public key used for encryption (MXE public key) */
  publicKey: Uint8Array;
}

/**
 * Encrypted bet amount
 * 
 * Individual bet amounts are stored encrypted in the MXE to prevent
 * opponents from learning betting patterns or stack sizes.
 */
export interface EncryptedBet {
  /** Player index who placed the bet */
  playerIndex: number;
  
  /** Encrypted bet amount */
  encryptedAmount: EncryptedBalance;
  
  /** Minimum bet (plaintext, for UI display) */
  minBet: bigint;
  
  /** Timestamp when bet was placed */
  timestamp: bigint;
}

/**
 * Reveal token for multi-party card reveal
 * 
 * Each player contributes a reveal token to decrypt a community card.
 * The MXE aggregates all tokens to produce the plaintext card value.
 */
export interface RevealToken {
  /** Player index contributing this token */
  playerIndex: number;
  
  /** Card index being revealed */
  cardIndex: number;
  
  /** Token value (scalar multiplication result) */
  token: Uint8Array;
  
  /** Timestamp when token was submitted */
  timestamp: bigint;
}

// ============================================================================
// Game Session Types
// ============================================================================

/**
 * Game session state
 * 
 * Represents the on-chain GameSession account state.
 */
export interface GameSession {
  /** Unique game identifier */
  gameId: bigint;
  
  /** Current game state */
  state: GameState;
  
  /** Maximum number of players */
  maxPlayers: number;
  
  /** Deck size (typically 52) */
  deckSize: number;
  
  /** Current number of players */
  numPlayers: number;
  
  /** Player public keys */
  players: PublicKey[];
  
  /** MXE session ID */
  mxeSessionId: Uint8Array;
  
  /** Encrypted deck commitment hash */
  encryptedDeckHash: Uint8Array;
  
  /** Shuffle bitmap (which players have shuffled) */
  shuffleBitmap: number;
  
  /** Reveal bitmap per card (which players have revealed each card) */
  revealBitmap: bigint[];
  
  /** Unmasked card values (0xFF = not yet revealed) */
  unmaskedCards: number[];
  
  /** Card assignments (player index or 0xFF for community) */
  cardAssignedTo: number[];
  
  /** Creation timestamp */
  createdAt: bigint;
  
  /** Shuffle deadline (timeout) */
  shuffleDeadline: bigint;
  
  /** Reveal deadline (timeout) */
  revealDeadline: bigint;
  
  /** PDA bump seed */
  bump: number;
}

/**
 * Poker table state
 * 
 * Represents the on-chain PokerTable account state.
 */
export interface PokerTable {
  /** Reference to GameSession PDA */
  gameSession: PublicKey;
  
  /** Current poker phase */
  phase: PokerPhase;
  
  /** Dealer button position (player index) */
  dealerIndex: number;
  
  /** Current player to act (player index) */
  currentPlayer: number;
  
  /** Pot mint (C-SPL token or USDC+) */
  potMint: PublicKey;
  
  /** Pot account (holds escrowed funds) */
  potAccount: PublicKey;
  
  /** Escrow account (USDC+ for Phase 1) */
  escrowAccount: PublicKey;
  
  /** Player stack accounts (C-SPL token accounts) */
  playerStacks: PublicKey[];
  
  /** Player bet accounts (current round bets) */
  playerBets: PublicKey[];
  
  /** Current bet amount (minimum for UI display) */
  currentBet: bigint;
  
  /** Folded bitmap (which players have folded) */
  foldedBitmap: number;
  
  /** All-in bitmap (which players are all-in) */
  allInBitmap: number;
  
  /** Hand verified bitmap (which players' hands are verified) */
  handVerifiedBitmap: number;
  
  /** Small blind amount */
  smallBlind: bigint;
  
  /** Big blind amount */
  bigBlind: bigint;
  
  /** Current hand number */
  handNumber: number;
  
  /** Last action timestamp (for timeout enforcement) */
  lastActionTime: bigint;
  
  /** PDA bump seed */
  bump: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the WagerModule
 */
export interface WagerModuleConfig {
  /** Solana connection */
  connection: Connection;
  
  /** User's wallet */
  wallet: AnchorWallet;
  
  /** Texas Hold'em program instance */
  tableProgram: Program;
  
  /** USDC+ mint address (Reflect Protocol) */
  usdcPlusMint: PublicKey;
  
  /** USDC mint address (for minting USDC+) */
  usdcMint: PublicKey;
  
  /** Arcium program ID */
  arciumProgramId: PublicKey;
  
  /** Cluster offset for Arcium (456 for devnet, 2026 for mainnet) */
  clusterOffset: number;

  /**
   * Optional Reflect Protocol mint instruction builder.
   *
   * When omitted, players must already hold enough USDC+ in their associated
   * token account. This keeps the SDK runnable while Reflect's TypeScript SDK
   * package/API is supplied by the host app.
   */
  reflectMintInstructionBuilder?: (
    params: ReflectMintInstructionParams
  ) => Promise<TransactionInstruction | TransactionInstruction[]>;
}

export interface ReflectMintInstructionParams {
  amount: string;
  sourceAccount: PublicKey;
  destinationAccount: PublicKey;
  owner: PublicKey;
}

/**
 * Configuration for creating a poker table
 */
export interface TableConfig {
  /** Maximum number of players (2-10) */
  maxPlayers: number;
  
  /** Deck size (default: 52) */
  deckSize?: number;
  
  /** Small blind amount (in lamports) */
  smallBlind: bigint;
  
  /** Big blind amount (in lamports) */
  bigBlind: bigint;
  
  /** Initial stack size for each player (in lamports) */
  initialStack?: bigint;
  
  /** Shuffle timeout in seconds (default: 300 = 5 minutes) */
  shuffleTimeout?: number;
  
  /** Reveal timeout in seconds (default: 300 = 5 minutes) */
  revealTimeout?: number;
  
  /** Betting timeout in seconds (default: 120 = 2 minutes) */
  bettingTimeout?: number;
}

/**
 * SDK configuration
 */
export interface SDKConfig {
  /** Solana RPC connection */
  connection: Connection;
  
  /** Wallet adapter (Phantom, Backpack, etc.) */
  wallet: AnchorWallet;
  
  /** CerberusPoker program ID */
  programId: PublicKey;
  
  /** Texas Hold'em program ID */
  texasHoldemProgramId?: PublicKey;
  
  /** Arcium program ID */
  arciumProgramId: PublicKey;
  
  /** Arcium cluster offset (devnet: 456, mainnet: 2026) */
  clusterOffset: number;
  
  /** USDC+ token mint (Reflect Protocol) */
  usdcPlusMint?: PublicKey;
  
  /** USDC token mint */
  usdcMint?: PublicKey;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Unsubscribe function for event listeners
 */
export type Unsubscribe = () => void;

/**
 * Game state change event
 */
export interface GameStateChangeEvent {
  /** Game ID */
  gameId: bigint;
  
  /** Previous state */
  previousState: GameState;
  
  /** New state */
  newState: GameState;
  
  /** Timestamp of state change */
  timestamp: bigint;
}

/**
 * Card dealt event
 */
export interface CardDealtEvent {
  /** Game ID */
  gameId: bigint;
  
  /** Card index in the deck */
  cardIndex: number;
  
  /** Player index who received the card */
  playerIndex: number;
  
  /** Timestamp when card was dealt */
  timestamp: bigint;
}

/**
 * Card revealed event
 */
export interface CardRevealedEvent {
  /** Game ID */
  gameId: bigint;
  
  /** Card index in the deck */
  cardIndex: number;
  
  /** Revealed card value */
  cardValue: Card;
  
  /** Timestamp when card was revealed */
  timestamp: bigint;
}

/**
 * Shuffle complete event
 */
export interface ShuffleCompleteEvent {
  /** Game ID */
  gameId: bigint;
  
  /** Encrypted deck commitment hash */
  deckHash: Uint8Array;
  
  /** Timestamp when shuffle completed */
  timestamp: bigint;
}

/**
 * Player joined event
 */
export interface PlayerJoinedEvent {
  /** Game ID */
  gameId: bigint;
  
  /** Player's public key */
  player: PublicKey;
  
  /** Player index (0-9) */
  playerIndex: number;
  
  /** Timestamp when player joined */
  timestamp: bigint;
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction confirmation options
 */
export interface ConfirmOptions {
  /** Skip preflight checks */
  skipPreflight?: boolean;
  
  /** Commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized';
  
  /** Max retries */
  maxRetries?: number;
  
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  /** Transaction signature */
  signature: string;
  
  /** Confirmation status */
  confirmed: boolean;
  
  /** Slot number */
  slot?: number;
  
  /** Error message if transaction failed */
  error?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Card suit enum
 */
export enum Suit {
  Clubs = 0,
  Diamonds = 1,
  Hearts = 2,
  Spades = 3,
}

/**
 * Card rank enum
 */
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
 * Decoded card information
 * 
 * Helper type for working with card values in a more readable format.
 */
export interface DecodedCard {
  /** Original card value (0-51) */
  value: Card;
  
  /** Card suit */
  suit: Suit;
  
  /** Card rank */
  rank: Rank;
  
  /** Human-readable string (e.g., "Ace of Spades") */
  display: string;
}

/**
 * Helper function type for decoding card values
 */
export type CardDecoder = (card: Card) => DecodedCard;

/**
 * Helper function type for encoding card values
 */
export type CardEncoder = (suit: Suit, rank: Rank) => Card;
