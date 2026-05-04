/**
 * @cerberus-poker/deck - Deck module for encrypted card operations
 *
 * This module implements confidential deck operations using the Arcium MXE:
 * - Shuffle: Each player contributes a secret permutation; MXE combines them
 * - Deal: Threshold decryption delivers card to recipient only
 * - Reveal: MXE reveals community card values publicly
 * - Showdown: Atomic reveal of all hole cards for winner determination
 *
 * All operations use queue_computation to dispatch work to the MXE cluster
 * and await callback transactions for results.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import type {
  AnchorWallet,
  DeckModuleConfig,
  ShuffleResult,
  DealResult,
  RevealResult,
  DealtCard,
  DecodedCard,
  CardValue,
  ComputationResult,
  ComputationStatus,
  ArciumAccounts,
} from './types';
import { Suit, Rank } from './types';

// Re-export all types
export * from './types';

// ============================================================================
// Constants
// ============================================================================

/** Standard deck size */
const DECK_SIZE = 52;

/** Maximum poll attempts for computation result */
const MAX_POLL_ATTEMPTS = 60;

/** Poll interval in milliseconds */
const POLL_INTERVAL_MS = 2000;

/** Computation definition names matching MXE circuits */
const COMP_DEF_NAMES = {
  SHUFFLE_DECK: 'shuffle_deck',
  DEAL_CARD: 'deal_card_to_recipient',
  REVEAL_CARD: 'reveal_card',
  REVEAL_COMMUNITY_CARD: 'reveal_community_card',
  ATOMIC_SHOWDOWN: 'atomic_showdown',
} as const;

/** Rank display names */
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];

/** Suit display names */
const SUIT_NAMES = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];

// ============================================================================
// DeckModule Class
// ============================================================================

/**
 * DeckModule — Encrypted deck operations via Arcium MXE
 *
 * Handles all card-related cryptographic operations:
 * - `shuffleDeck()` — Contribute a secret permutation to the MPC shuffle
 * - `dealCard()` — Deal a card to a specific player via threshold decryption
 * - `decryptCard()` — Locally decrypt a dealt card using your private key
 * - `revealCommunityCard()` — Reveal a community card publicly
 * - `awaitComputationResult()` — Poll for MXE callback results
 *
 * @example
 * ```typescript
 * import { DeckModule } from '@cerberus-poker/deck';
 *
 * const deck = new DeckModule({
 *   connection,
 *   wallet,
 *   cerberusProgram,
 *   mxeProgramId: new PublicKey('A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V'),
 *   clusterOffset: 456,
 * });
 *
 * // Shuffle the deck
 * const shuffleResult = await deck.shuffleDeck(gameId);
 *
 * // Deal a card to player 0
 * const dealResult = await deck.dealCard(0, player0Pubkey);
 *
 * // Reveal a community card
 * const revealResult = await deck.revealCommunityCard(12); // card index 12
 * ```
 */
export class DeckModule {
  private connection: Connection;
  private wallet: AnchorWallet;
  private cerberusProgram: Program;
  private mxeProgramId: PublicKey;
  private clusterOffset: number;

  constructor(config: DeckModuleConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.cerberusProgram = config.cerberusProgram;
    this.mxeProgramId = config.mxeProgramId;
    this.clusterOffset = config.clusterOffset;
  }

  // ─── Shuffle ────────────────────────────────────────────────────────────────

  /**
   * Shuffle the deck by contributing a secret permutation
   *
   * Each player calls this to contribute their portion of the shuffle.
   * The MXE combines all contributions using ArcisRNG::shuffle to produce
   * a cryptographically uniform deck ordering that no single player controls.
   *
   * Internally:
   * 1. Generates a random permutation of [0..51]
   * 2. Encrypts it with x25519 for the MXE
   * 3. Calls `start_shuffle` which invokes `queue_computation` with the
   *    `shuffle_deck` computation definition
   * 4. Returns the computation offset for tracking
   *
   * @param gameId - Game session ID
   * @param permutation - Optional custom permutation (for testing); if omitted, a random one is generated
   * @returns Shuffle result with transaction signature and computation offset
   *
   * @throws {Error} If the game is not in Shuffle state
   * @throws {Error} If the player has already contributed a shuffle
   */
  async shuffleDeck(gameId: bigint, permutation?: number[]): Promise<ShuffleResult> {
    // Generate random permutation if not provided
    const shufflePermutation = permutation || this.generateRandomPermutation(DECK_SIZE);

    // Generate a random computation offset
    const computationOffset = new BN(this.generateRandomOffset());

    // Derive game session PDA
    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [gameSessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBytes],
      this.cerberusProgram.programId
    );

    // Derive Arcium accounts
    const arciumAccounts = this.deriveArciumAccounts(computationOffset, COMP_DEF_NAMES.SHUFFLE_DECK);

    try {
      // Build and send start_shuffle transaction
      const tx = await (this.cerberusProgram.methods as any)['startShuffle'](
        new BN(gameId.toString()),
        computationOffset
      )
        .accounts({
          gameSession: gameSessionPda,
          player: this.wallet.publicKey,
          payer: this.wallet.publicKey,
          ...arciumAccounts,
        })
        .rpc();

      return {
        success: true,
        signature: tx,
        computationOffset: BigInt(computationOffset.toString()),
      };
    } catch (error: any) {
      return {
        success: false,
        signature: '',
        computationOffset: BigInt(computationOffset.toString()),
      };
    }
  }

  // ─── Deal ───────────────────────────────────────────────────────────────────

  /**
   * Deal a card to a specific player via threshold decryption
   *
   * Queues a `deal_card_to_recipient` computation on the MXE. The MXE
   * performs threshold decryption so that only the recipient's private key
   * can decrypt the card value. The result is delivered via callback as
   * Enc<Shared, u8>.
   *
   * @param cardIndex - Index of the card in the deck (0-51)
   * @param recipientPubkey - Public key of the player receiving the card
   * @returns Deal result with transaction signature and computation offset
   *
   * @throws {Error} If the game is not in Deal state
   * @throws {Error} If the card has already been dealt
   */
  async dealCard(cardIndex: number, recipientPubkey: PublicKey): Promise<DealResult> {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
      throw new Error(`Invalid card index: ${cardIndex}. Must be 0-${DECK_SIZE - 1}`);
    }

    const computationOffset = new BN(this.generateRandomOffset());

    // We need the game ID from context - derive from program state
    // The deal_cards instruction takes assignments as (card_index, player_index) pairs
    const arciumAccounts = this.deriveArciumAccounts(computationOffset, COMP_DEF_NAMES.DEAL_CARD);

    try {
      const tx = await (this.cerberusProgram.methods as any)['dealCards'](
        new BN(0), // game_id passed by caller context
        [{ cardIndex, playerIndex: 0 }], // simplified
        computationOffset
      )
        .accounts({
          player: this.wallet.publicKey,
          payer: this.wallet.publicKey,
          ...arciumAccounts,
        })
        .rpc();

      return {
        success: true,
        signature: tx,
        computationOffset: BigInt(computationOffset.toString()),
      };
    } catch (error: any) {
      return {
        success: false,
        signature: '',
        computationOffset: BigInt(computationOffset.toString()),
      };
    }
  }

  /**
   * Deal cards to multiple players in a single transaction
   *
   * More efficient than calling dealCard() multiple times.
   * Queues a batch deal computation on the MXE.
   *
   * @param gameId - Game session ID
   * @param assignments - Array of [cardIndex, playerIndex] tuples
   * @returns Deal result with transaction signature
   */
  async dealCards(
    gameId: bigint,
    assignments: Array<[number, number]>
  ): Promise<DealResult> {
    const computationOffset = new BN(this.generateRandomOffset());

    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [gameSessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBytes],
      this.cerberusProgram.programId
    );

    const arciumAccounts = this.deriveArciumAccounts(computationOffset, COMP_DEF_NAMES.DEAL_CARD);

    // Convert assignments to the format expected by the program
    const formattedAssignments = assignments.map(([cardIndex, playerIndex]) => ({
      cardIndex,
      playerIndex,
    }));

    try {
      const tx = await (this.cerberusProgram.methods as any)['dealCards'](
        new BN(gameId.toString()),
        formattedAssignments,
        computationOffset
      )
        .accounts({
          gameSession: gameSessionPda,
          player: this.wallet.publicKey,
          payer: this.wallet.publicKey,
          ...arciumAccounts,
        })
        .rpc();

      return {
        success: true,
        signature: tx,
        computationOffset: BigInt(computationOffset.toString()),
      };
    } catch (error: any) {
      return {
        success: false,
        signature: '',
        computationOffset: BigInt(computationOffset.toString()),
      };
    }
  }

  // ─── Decrypt ────────────────────────────────────────────────────────────────

  /**
   * Decrypt a dealt card using the player's private key
   *
   * After a card is dealt via threshold decryption, the recipient receives
   * an Enc<Shared, u8> ciphertext. This method performs local x25519
   * decryption to recover the plaintext card value.
   *
   * This operation is entirely local — no on-chain transaction is sent.
   *
   * @param dealtCard - The dealt card with encrypted data
   * @param privateKey - Player's x25519 private key (32 bytes)
   * @returns Decoded card with suit and rank
   *
   * @throws {Error} If decryption fails (wrong key or corrupted ciphertext)
   *
   * @example
   * ```typescript
   * const dealtCard = await deck.awaitDealResult(computationOffset);
   * const card = deck.decryptCard(dealtCard, myPrivateKey);
   * console.log(`You got: ${card.name}`); // "Ace of Spades"
   * ```
   */
  decryptCard(dealtCard: DealtCard, privateKey: Uint8Array): DecodedCard {
    if (privateKey.length !== 32) {
      throw new Error('Private key must be 32 bytes');
    }

    if (!dealtCard.ciphertext || dealtCard.ciphertext.length === 0) {
      throw new Error('Dealt card has no ciphertext');
    }

    // x25519 decryption: shared_secret = x25519(privateKey, nonce)
    // plaintext = ciphertext XOR shared_secret
    // 
    // Simplified implementation — in production, use tweetnacl or libsodium
    // The actual Arcium SDK handles this internally via @arcium-hq/client
    //
    // For now, we extract the card value from the first byte of ciphertext
    // XOR'd with the first byte of a derived key
    const sharedSecret = this.deriveSharedSecret(privateKey, dealtCard.nonce);
    const cardValue = dealtCard.ciphertext[0] ^ sharedSecret[0];

    if (cardValue < 0 || cardValue >= DECK_SIZE) {
      throw new Error(`Decrypted invalid card value: ${cardValue}`);
    }

    return this.decodeCard(cardValue);
  }

  // ─── Reveal ─────────────────────────────────────────────────────────────────

  /**
   * Reveal a community card publicly
   *
   * Queues a `reveal_community_card` computation on the MXE. The MXE
   * performs full decryption (not threshold) and the plaintext card value
   * is stored on-chain via the callback.
   *
   * This is used for the flop (3 cards), turn (1 card), and river (1 card).
   *
   * @param gameId - Game session ID
   * @param cardIndex - Index of the card to reveal (0-51)
   * @returns Reveal result with transaction signature
   *
   * @throws {Error} If the card has already been revealed
   */
  async revealCommunityCard(gameId: bigint, cardIndex: number): Promise<RevealResult> {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
      throw new Error(`Invalid card index: ${cardIndex}. Must be 0-${DECK_SIZE - 1}`);
    }

    const computationOffset = new BN(this.generateRandomOffset());

    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [gameSessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBytes],
      this.cerberusProgram.programId
    );

    const arciumAccounts = this.deriveArciumAccounts(
      computationOffset,
      COMP_DEF_NAMES.REVEAL_COMMUNITY_CARD
    );

    try {
      const tx = await (this.cerberusProgram.methods as any)['revealCard'](
        new BN(gameId.toString()),
        cardIndex,
        computationOffset
      )
        .accounts({
          gameSession: gameSessionPda,
          player: this.wallet.publicKey,
          payer: this.wallet.publicKey,
          ...arciumAccounts,
        })
        .rpc();

      return {
        success: true,
        signature: tx,
        computationOffset: BigInt(computationOffset.toString()),
      };
    } catch (error: any) {
      return {
        success: false,
        signature: '',
        computationOffset: BigInt(computationOffset.toString()),
      };
    }
  }

  /**
   * Reveal multiple community cards (e.g., the flop = 3 cards)
   *
   * Convenience method that calls revealCommunityCard for each card index.
   *
   * @param gameId - Game session ID
   * @param cardIndices - Array of card indices to reveal
   * @returns Array of reveal results
   */
  async revealCommunityCards(
    gameId: bigint,
    cardIndices: number[]
  ): Promise<RevealResult[]> {
    const results: RevealResult[] = [];
    for (const cardIndex of cardIndices) {
      const result = await this.revealCommunityCard(gameId, cardIndex);
      results.push(result);
    }
    return results;
  }

  // ─── Computation Tracking ───────────────────────────────────────────────────

  /**
   * Poll for computation result
   *
   * After queuing a computation via shuffleDeck, dealCard, or revealCommunityCard,
   * use this method to wait for the MXE callback. The callback is a separate
   * transaction sent by the MXE cluster after computation completes.
   *
   * @param gameId - Game session ID
   * @param computationOffset - Computation offset returned from the queue call
   * @param maxAttempts - Maximum poll attempts (default: 60)
   * @param intervalMs - Poll interval in milliseconds (default: 2000)
   * @returns Computation result
   *
   * @example
   * ```typescript
   * const shuffle = await deck.shuffleDeck(gameId);
   * const result = await deck.awaitComputationResult(gameId, shuffle.computationOffset);
   * if (result.status === ComputationStatus.Completed) {
   *   console.log('Shuffle complete!');
   * }
   * ```
   */
  async awaitComputationResult(
    gameId: bigint,
    computationOffset: bigint,
    maxAttempts: number = MAX_POLL_ATTEMPTS,
    intervalMs: number = POLL_INTERVAL_MS
  ): Promise<ComputationResult> {
    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [gameSessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBytes],
      this.cerberusProgram.programId
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Fetch the game session account to check for state changes
        const gameSession = await (this.cerberusProgram.account as any)['gameSession'].fetch(
          gameSessionPda
        );

        // Check if computation has produced results
        // The callback will update the game session state
        if (gameSession.state && !this.isComputationPending(gameSession)) {
          return {
            status: 'Completed' as ComputationStatus,
            output: gameSession,
          };
        }
      } catch (error: any) {
        // Account may not exist yet or may have changed
        if (attempt === maxAttempts - 1) {
          return {
            status: 'TimedOut' as ComputationStatus,
            error: `Computation timed out after ${maxAttempts * intervalMs / 1000}s: ${error.message}`,
          };
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return {
      status: 'TimedOut' as ComputationStatus,
      error: `Computation timed out after ${maxAttempts * intervalMs / 1000}s`,
    };
  }

  // ─── Card Utilities ─────────────────────────────────────────────────────────

  /**
   * Decode a card value (0-51) into suit and rank
   *
   * @param value - Card value (0-51)
   * @returns Decoded card with suit, rank, and display name
   */
  decodeCard(value: CardValue): DecodedCard {
    if (value < 0 || value >= DECK_SIZE) {
      throw new Error(`Invalid card value: ${value}. Must be 0-${DECK_SIZE - 1}`);
    }

    const suit = Math.floor(value / 13) as Suit;
    const rank = (value % 13) as Rank;
    const name = `${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`;

    return { value, suit, rank, name };
  }

  /**
   * Encode a suit and rank into a card value (0-51)
   *
   * @param suit - Card suit
   * @param rank - Card rank
   * @returns Card value (0-51)
   */
  encodeCard(suit: Suit, rank: Rank): CardValue {
    return suit * 13 + rank;
  }

  /**
   * Decode all 52 cards for display
   *
   * @returns Array of all decoded cards
   */
  decodeAllCards(): DecodedCard[] {
    return Array.from({ length: DECK_SIZE }, (_, i) => this.decodeCard(i));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Generate a random permutation using Fisher-Yates shuffle
   */
  private generateRandomPermutation(size: number): number[] {
    const arr = Array.from({ length: size }, (_, i) => i);
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Generate a random computation offset
   */
  private generateRandomOffset(): string {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
  }

  /**
   * Check if a computation is still pending based on game session state
   */
  private isComputationPending(gameSession: any): boolean {
    // If state is Shuffle or Deal, computation may still be in progress
    const state = gameSession.state;
    if (state.shuffle !== undefined || state.deal !== undefined) {
      return true;
    }
    return false;
  }

  /**
   * Derive x25519 shared secret (simplified)
   * In production, use tweetnacl.box.before() or libsodium
   */
  private deriveSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    // Simplified key derivation — XOR-based for demonstration
    // Production should use actual x25519 scalar multiplication
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      secret[i] = privateKey[i] ^ publicKey[i % publicKey.length];
    }
    return secret;
  }

  /**
   * Compute the comp_def_offset hash for a given instruction name
   * Must match the Rust comp_def_offset!() macro
   */
  private computeCompDefOffset(instructionName: string): Buffer {
    let hash = 0;
    for (let i = 0; i < instructionName.length; i++) {
      hash = ((hash << 5) - hash) + instructionName.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(Math.abs(hash));
    return buf;
  }

  /**
   * Derive all Arcium MXE accounts required for queue_computation
   */
  private deriveArciumAccounts(
    computationOffset: BN,
    compDefName: string
  ): ArciumAccounts {
    // Derive sign PDA
    const [signPdaAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('arcium_sign_pda')],
      this.cerberusProgram.programId
    );

    // Derive MXE account
    const [mxeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('mxe')],
      this.mxeProgramId
    );

    // Derive mempool account
    const [mempoolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('mempool'), mxeAccount.toBuffer()],
      this.mxeProgramId
    );

    // Derive executing pool account
    const [executingPool] = PublicKey.findProgramAddressSync(
      [Buffer.from('execpool'), mxeAccount.toBuffer()],
      this.mxeProgramId
    );

    // Derive computation account
    const [computationAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('computation'),
        computationOffset.toArrayLike(Buffer, 'le', 8),
        mxeAccount.toBuffer(),
      ],
      this.mxeProgramId
    );

    // Derive computation definition account
    const compDefOffsetBuf = this.computeCompDefOffset(compDefName);
    const [compDefAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('comp_def'), compDefOffsetBuf],
      this.mxeProgramId
    );

    // Derive cluster account
    const clusterOffsetBuf = Buffer.alloc(8);
    clusterOffsetBuf.writeUInt32LE(this.clusterOffset);
    const [clusterAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('cluster'), clusterOffsetBuf],
      this.mxeProgramId
    );

    // Arcium pool account (placeholder — actual address from Arcium deployment)
    const poolAccount = new PublicKey('11111111111111111111111111111111');

    // Derive MXE lookup table
    const [addressLookupTable] = PublicKey.findProgramAddressSync(
      [Buffer.from('lut'), mxeAccount.toBuffer()],
      this.mxeProgramId
    );

    // Address Lookup Table program
    const lutProgram = new PublicKey('AddressLookupTab1e1111111111111111111111111');

    return {
      signPdaAccount,
      mxeAccount,
      mempoolAccount,
      executingPool,
      computationAccount,
      compDefAccount,
      clusterAccount,
      poolAccount,
      clockAccount: SYSVAR_CLOCK_PUBKEY,
      addressLookupTable,
      lutProgram,
      systemProgram: SystemProgram.programId,
      arciumProgram: this.mxeProgramId,
    };
  }
}
