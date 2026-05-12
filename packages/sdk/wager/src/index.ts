/**
 * @cerberus-poker/wager - Wager module for confidential betting
 * 
 * This module implements Phase 1 of the wager strategy:
 * - Players deposit USDC+ (Reflect Protocol) into an escrow PDA
 * - Bet amounts are encrypted and stored in the Arcium MXE as Enc<Mxe, u64>
 * - At showdown, the MXE reveals the winner and the escrow releases funds
 * 
 * Phase 2 (future): When Arcium's C-SPL becomes available, the backend will
 * be swapped to use confidential transfers while keeping the same SDK interface.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import type { AnchorWallet, ReflectMintInstructionParams, WagerModuleConfig } from './types';

// Re-export all types
export * from './types';

type ReflectMintInstructionBuilder = (
  params: ReflectMintInstructionParams
) => Promise<TransactionInstruction | TransactionInstruction[]>;

/**
 * WagerModule - Handles confidential betting operations
 * 
 * This module provides methods for placing bets, calling, folding, and settling
 * showdowns. All bet amounts are encrypted via the Arcium MXE to hide them from
 * observers.
 * 
 * @example
 * ```typescript
 * const wager = new WagerModule({
 *   connection,
 *   wallet,
 *   tableProgram,
 *   usdcPlusMint,
 *   usdcMint,
 *   arciumProgramId,
 *   clusterOffset: 456, // devnet
 * });
 * 
 * // Place a bet of 100 USDC+
 * const sig = await wager.placeBet(gameId, 100_000_000n, 0);
 * ```
 */
export class WagerModule {
  private connection: Connection;
  private wallet: AnchorWallet;
  private tableProgram: Program;
  private usdcPlusMint: PublicKey;
  private usdcMint: PublicKey;
  private arciumProgramId: PublicKey;
  private clusterOffset: number;
  private reflectMintInstructionBuilder: ReflectMintInstructionBuilder | undefined;

  constructor(config: WagerModuleConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.tableProgram = config.tableProgram;
    this.usdcPlusMint = config.usdcPlusMint;
    this.usdcMint = config.usdcMint;
    this.arciumProgramId = config.arciumProgramId;
    this.clusterOffset = config.clusterOffset;
    this.reflectMintInstructionBuilder = config.reflectMintInstructionBuilder;
  }

  /**
   * Place a bet: mint USDC+ if needed, then transfer to escrow
   * 
   * This method implements the full betting flow:
   * 1. Checks if the player has enough USDC+ balance
   * 2. If not, mints USDC+ from USDC via Reflect Protocol
   * 3. Transfers USDC+ to the game's escrow PDA
   * 4. Queues an MXE computation to store the encrypted bet amount
   * 
   * The bet amount is visible on-chain as a standard SPL transfer, but the
   * MXE stores the encrypted amount hidden from all observers. At showdown,
   * the MXE reveals the winner and correct pot distribution.
   * 
   * @param gameId - Unique identifier for the game
   * @param amount - Bet amount in lamports (e.g., 100_000_000 = 100 USDC+)
   * @param playerIndex - Index of the player placing the bet (0-9)
   * @returns Transaction signature
   * 
   * @throws {Error} If the player doesn't have enough USDC to mint USDC+
   * @throws {Error} If the transaction fails
   * 
   * @example
   * ```typescript
   * // Place a bet of 50 USDC+ (50_000_000 lamports)
   * const sig = await wager.placeBet(gameId, 50_000_000n, 0);
   * console.log('Bet placed:', sig);
   * ```
   */
  async placeBet(
    gameId: bigint,
    amount: bigint,
    playerIndex: number
  ): Promise<TransactionSignature> {
    // 1. Get player's USDC+ token account
    const playerUsdcPlusAccount = await getAssociatedTokenAddress(
      this.usdcPlusMint,
      this.wallet.publicKey
    );

    // 2. Check if player has enough USDC+ balance
    let mintAmount = 0n;
    try {
      const accountInfo = await this.connection.getAccountInfo(playerUsdcPlusAccount);
      if (!accountInfo) {
        mintAmount = amount;
      } else {
        const tokenAccount = await this.connection.getTokenAccountBalance(playerUsdcPlusAccount);
        const balance = BigInt(tokenAccount.value.amount);
        if (balance < amount) {
          mintAmount = amount - balance;
        }
      }
    } catch (error) {
      mintAmount = amount;
    }

    // 3. Mint USDC+ if needed
    if (mintAmount > 0n) {
      await this.mintUsdcPlus(mintAmount);
    }

    // 4. Derive the poker table PDA
    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [pokerTablePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('table'), gameIdBytes],
      this.tableProgram.programId
    );

    // 5. Fetch the poker table to get the escrow account
    const pokerTable = await (this.tableProgram.account as any)['pokerTable'].fetch(pokerTablePda);
    const escrowAccount = pokerTable.escrowAccount as PublicKey;

    // 6. Generate a random computation offset for the MXE
    const computationOffset = new BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

    // 7. Derive Arcium MXE accounts
    const arciumAccounts = await this.deriveArciumAccounts(computationOffset);

    // 8. Build and send the place_bet transaction
    const tx = await (this.tableProgram.methods as any)['placeBet'](
      new BN(gameId.toString()),
      new BN(amount.toString()),
      playerIndex,
      computationOffset
    )
      .accounts({
        pokerTable: pokerTablePda,
        playerTokenAccount: playerUsdcPlusAccount,
        escrowAccount: escrowAccount,
        player: this.wallet.publicKey,
        payer: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        ...arciumAccounts,
      })
      .rpc();

    return tx;
  }

  /**
   * Mint USDC+ from USDC via Reflect Protocol
   * 
   * This method uses the Reflect SDK to mint USDC+ (yield-bearing stablecoin)
   * from the player's USDC balance. The minted USDC+ earns yield while the
   * game is in progress.
   * 
   * @param amount - Amount of USDC+ to mint (in lamports)
   * @returns Transaction signature
   * 
   * @throws {Error} If the player doesn't have enough USDC
   * @throws {Error} If the minting transaction fails
   * 
   * @private
   */
  private async mintUsdcPlus(amount: bigint): Promise<TransactionSignature> {
    if (!this.reflectMintInstructionBuilder) {
      throw new Error(
        'Insufficient USDC+ balance. Pre-fund the wallet or pass reflectMintInstructionBuilder in WagerModuleConfig.'
      );
    }

    // Get player's USDC token account
    const playerUsdcAccount = await getAssociatedTokenAddress(
      this.usdcMint,
      this.wallet.publicKey
    );

    // Get player's USDC+ token account (create if needed)
    const playerUsdcPlusAccount = await getAssociatedTokenAddress(
      this.usdcPlusMint,
      this.wallet.publicKey
    );

    // Check if USDC+ account exists, create if not
    const usdcPlusAccountInfo = await this.connection.getAccountInfo(playerUsdcPlusAccount);
    const tx = new Transaction();

    if (!usdcPlusAccountInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          playerUsdcPlusAccount,
          this.wallet.publicKey,
          this.usdcPlusMint
        )
      );
    }

    const mintInstructions = await this.reflectMintInstructionBuilder({
      amount: amount.toString(),
      sourceAccount: playerUsdcAccount,
      destinationAccount: playerUsdcPlusAccount,
      owner: this.wallet.publicKey,
    });

    tx.add(...(Array.isArray(mintInstructions) ? mintInstructions : [mintInstructions]));

    // Sign and send transaction
    const provider = new AnchorProvider(
      this.connection,
      this.wallet as any, // Type assertion for wallet compatibility
      AnchorProvider.defaultOptions()
    );
    const signedTx = await this.wallet.signTransaction(tx);
    const signature = await provider.connection.sendRawTransaction(signedTx.serialize());
    await provider.connection.confirmTransaction(signature);

    return signature;
  }

  /**
   * Derive Arcium MXE accounts required for queue_computation
   * 
   * These accounts are required by the Arcium protocol to queue a computation
   * that stores the encrypted bet amount in the MXE.
   * 
   * @param computationOffset - Unique offset for this computation
   * @returns Object containing all required Arcium account addresses
   * 
   * @private
   */
  private async deriveArciumAccounts(computationOffset: BN): Promise<{
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
  }> {
    // Derive sign PDA
    const [signPdaAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('SignerAccount')],
      this.tableProgram.programId
    );

    // Derive MXE account
    const [mxeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('MXEAccount'), this.tableProgram.programId.toBuffer()],
      this.arciumProgramId
    );

    // Derive mempool account
    const [mempoolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('Mempool'), this.tableProgram.programId.toBuffer()],
      this.arciumProgramId
    );

    // Derive executing pool account
    const [executingPool] = PublicKey.findProgramAddressSync(
      [Buffer.from('Execpool'), this.tableProgram.programId.toBuffer()],
      this.arciumProgramId
    );

    // Derive computation account
    const [computationAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('ComputationAccount'),
        this.tableProgram.programId.toBuffer(),
        computationOffset.toArrayLike(Buffer, 'le', 8),
      ],
      this.arciumProgramId
    );

    const compDefOffset = await this.computeCompDefOffset('place_bet');
    const [compDefAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('ComputationDefinitionAccount'),
        this.tableProgram.programId.toBuffer(),
        compDefOffset,
      ],
      this.arciumProgramId
    );

    // Derive cluster account
    const clusterOffset = Buffer.alloc(4);
    clusterOffset.writeUInt32LE(this.clusterOffset, 0);
    const [clusterAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('Cluster'), clusterOffset],
      this.arciumProgramId
    );

    const [poolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('FeePool')],
      this.arciumProgramId
    );

    const [clockAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('ClockAccount')],
      this.arciumProgramId
    );

    const [addressLookupTable] = PublicKey.findProgramAddressSync(
      [Buffer.from('AddressLookupTable'), mxeAccount.toBuffer()],
      this.arciumProgramId
    );

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
      clockAccount,
      addressLookupTable,
      lutProgram,
      systemProgram: SystemProgram.programId,
      arciumProgram: this.arciumProgramId,
    };
  }

  /**
   * Compute the computation definition offset for a given instruction name
   * 
   * This matches the Rust macro `comp_def_offset!("instruction_name")`
   * 
   * @param instructionName - Name of the encrypted instruction
   * @returns Computation definition offset
   * 
   * @private
   */
  private async computeCompDefOffset(instructionName: string): Promise<Buffer> {
    if (!globalThis.crypto?.subtle) {
      throw new Error('Web Crypto is required to derive Arcium computation definition accounts');
    }

    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(instructionName)
    );
    return Buffer.from(new Uint8Array(digest).slice(0, 4));
  }

  /**
   * Call the current bet — matches the current bet amount
   *
   * Fetches the current bet from on-chain state, then sends a `player_action`
   * instruction with `Action::Call`. The call amount is transferred from the
   * player's USDC+ account to the game's escrow PDA, and an MXE computation
   * is queued to store the encrypted bet amount.
   *
   * @param gameId - Unique identifier for the game
   * @returns Transaction signature
   *
   * @throws {Error} If it's not the player's turn
   * @throws {Error} If there is no bet to call (use check instead)
   *
   * @example
   * ```typescript
   * const sig = await wager.callBet(gameId);
   * console.log('Called bet:', sig);
   * ```
   */
  async callBet(gameId: bigint): Promise<TransactionSignature> {
    // 1. Derive the poker table PDA
    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [pokerTablePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('table'), gameIdBytes],
      this.tableProgram.programId
    );

    // 2. Fetch the poker table to get current bet amount
    const pokerTable = await (this.tableProgram.account as any)['pokerTable'].fetch(pokerTablePda);
    const currentBet = pokerTable.currentBet as BN;

    // 3. Get player's USDC+ token account
    const playerUsdcPlusAccount = await getAssociatedTokenAddress(
      this.usdcPlusMint,
      this.wallet.publicKey
    );

    // 4. Generate computation offset for MXE
    const computationOffset = new BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

    // 5. Derive Arcium accounts
    const arciumAccounts = await this.deriveArciumAccounts(computationOffset);

    // 6. Find the player's index in the game
    const gameSessionPda = pokerTable.gameSession as PublicKey;

    // 7. Build and send the player_action transaction with Action::Call
    const tx = await (this.tableProgram.methods as any)['playerAction'](
      new BN(gameId.toString()),
      { call: {} }, // Action::Call enum variant
      currentBet,
      computationOffset
    )
      .accounts({
        pokerTable: pokerTablePda,
        gameSession: gameSessionPda,
        playerTokenAccount: playerUsdcPlusAccount,
        escrowAccount: pokerTable.escrowAccount,
        player: this.wallet.publicKey,
        payer: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        ...arciumAccounts,
      })
      .rpc();

    return tx;
  }

  /**
   * Fold — exits the hand without revealing cards or stack
   *
   * Sends a `player_action` instruction with `Action::Fold`. This sets the
   * player's bit in the `folded_bitmap`, preventing further actions. No funds
   * are transferred, and the player's cards remain hidden.
   *
   * @param gameId - Unique identifier for the game
   * @returns Transaction signature
   *
   * @throws {Error} If it's not the player's turn
   * @throws {Error} If the player has already folded
   *
   * @example
   * ```typescript
   * const sig = await wager.fold(gameId);
   * console.log('Folded:', sig);
   * ```
   */
  async fold(gameId: bigint): Promise<TransactionSignature> {
    // 1. Derive the poker table PDA
    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [pokerTablePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('table'), gameIdBytes],
      this.tableProgram.programId
    );

    // 2. Fetch the poker table to get game session reference
    const pokerTable = await (this.tableProgram.account as any)['pokerTable'].fetch(pokerTablePda);
    const gameSessionPda = pokerTable.gameSession as PublicKey;

    // 3. Fold doesn't require token transfer or MXE computation
    const computationOffset = new BN(0); // Unused for fold

    // 4. Build and send the player_action transaction with Action::Fold
    const tx = await (this.tableProgram.methods as any)['playerAction'](
      new BN(gameId.toString()),
      { fold: {} }, // Action::Fold enum variant
      new BN(0), // No amount for fold
      computationOffset
    )
      .accounts({
        pokerTable: pokerTablePda,
        gameSession: gameSessionPda,
        player: this.wallet.publicKey,
        payer: this.wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  /**
   * Settle the showdown — triggers pot distribution to winner(s)
   *
   * Calls the `showdown` instruction which:
   * 1. Verifies all non-folded players have verified hands
   * 2. Evaluates each player's hand using the on-chain evaluator
   * 3. Determines winner(s) and distributes the pot
   * 4. Handles split pots for tied hands
   *
   * @param gameId - Unique identifier for the game
   * @returns Transaction signature
   *
   * @throws {Error} If not all hands are verified
   * @throws {Error} If the game is not in Showdown phase
   *
   * @example
   * ```typescript
   * const sig = await wager.settleShowdown(gameId);
   * console.log('Showdown settled, pot distributed:', sig);
   * ```
   */
  async settleShowdown(gameId: bigint): Promise<TransactionSignature> {
    // 1. Derive the poker table PDA
    const gameIdBytes = Buffer.alloc(8);
    gameIdBytes.writeBigUInt64LE(gameId);
    const [pokerTablePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('table'), gameIdBytes],
      this.tableProgram.programId
    );

    // 2. Fetch poker table state
    const pokerTable = await (this.tableProgram.account as any)['pokerTable'].fetch(pokerTablePda);
    const escrowAccount = pokerTable.escrowAccount as PublicKey;
    const gameSessionPda = pokerTable.gameSession as PublicKey;

    // 3. Pass every known player stack as a writable remaining account.
    // The on-chain settlement code selects only the winning destinations.
    const playerStacks = (pokerTable.playerStacks as PublicKey[] | undefined) ?? [];
    const remainingAccounts = playerStacks
      .filter((stack) => stack && !stack.equals(PublicKey.default))
      .map((pubkey) => ({
        pubkey,
        isWritable: true,
        isSigner: false,
      }));

    // 4. Build and send the showdown transaction
    const tx = await (this.tableProgram.methods as any)['showdown'](
      new BN(gameId.toString())
    )
      .accounts({
        pokerTable: pokerTablePda,
        gameSession: gameSessionPda,
        escrowAccount: escrowAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        caller: this.wallet.publicKey,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();

    return tx;
  }

  /**
   * Get encrypted balance for a player
   *
   * Fetches the player's USDC+ token account and returns the balance.
   * In Phase 1 (current), this is a standard SPL token balance.
   * In Phase 2 (future C-SPL), this will return encrypted balance ciphertext.
   *
   * @param playerPubkey - Player's public key
   * @returns Encrypted balance structure
   *
   * @example
   * ```typescript
   * const balance = await wager.getEncryptedBalance(playerPubkey);
   * console.log('Balance ciphertext:', balance.ciphertext);
   * ```
   */
  async getEncryptedBalance(playerPubkey: PublicKey): Promise<import('./types').EncryptedBalance> {
    // Get the player's USDC+ associated token account
    const playerTokenAccount = await getAssociatedTokenAddress(
      this.usdcPlusMint,
      playerPubkey
    );

    try {
      // Fetch the token account balance
      const tokenAccountInfo = await this.connection.getAccountInfo(playerTokenAccount);

      if (!tokenAccountInfo) {
        // No token account — return zero balance
        return {
          ciphertext: new Uint8Array(0),
          nonce: new Uint8Array(0),
          publicKey: new Uint8Array(0),
        };
      }

      // In Phase 1 (USDC+ via Reflect), the balance is plaintext
      // We encode it as "ciphertext" for API compatibility with Phase 2 (C-SPL)
      const tokenBalance = await this.connection.getTokenAccountBalance(playerTokenAccount);
      const balanceBytes = Buffer.alloc(8);
      balanceBytes.writeBigUInt64LE(BigInt(tokenBalance.value.amount));

      return {
        ciphertext: new Uint8Array(balanceBytes),
        nonce: new Uint8Array(0), // No encryption in Phase 1
        publicKey: playerPubkey.toBytes(),
      };
    } catch (error: any) {
      // Token account doesn't exist — return zero balance
      return {
        ciphertext: new Uint8Array(8), // 8 bytes of zeros = 0 balance
        nonce: new Uint8Array(0),
        publicKey: playerPubkey.toBytes(),
      };
    }
  }
}
