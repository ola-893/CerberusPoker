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
  TransactionSignature,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import type { AnchorWallet, WagerModuleConfig } from './types';

// Re-export all types
export * from './types';

// TODO: Import ReflectSDK when the actual SDK is available
// import { ReflectSDK } from '@reflect-protocol/sdk';
// For now, we'll use a placeholder interface
interface ReflectSDK {
  createMintInstruction(params: {
    amount: string;
    sourceAccount: PublicKey;
    destinationAccount: PublicKey;
    owner: PublicKey;
  }): Promise<any>;
}

class PlaceholderReflectSDK implements ReflectSDK {
  constructor(private connection: Connection) {}
  
  async createMintInstruction(params: {
    amount: string;
    sourceAccount: PublicKey;
    destinationAccount: PublicKey;
    owner: PublicKey;
  }): Promise<any> {
    // TODO: Replace with actual Reflect SDK implementation
    throw new Error('Reflect SDK not yet integrated. Please implement USDC+ minting.');
  }
}

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
  private reflectSDK: PlaceholderReflectSDK;

  constructor(config: WagerModuleConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.tableProgram = config.tableProgram;
    this.usdcPlusMint = config.usdcPlusMint;
    this.usdcMint = config.usdcMint;
    this.arciumProgramId = config.arciumProgramId;
    this.clusterOffset = config.clusterOffset;
    
    // Initialize Reflect SDK for USDC+ minting
    // TODO: Replace with actual ReflectSDK when available
    this.reflectSDK = new PlaceholderReflectSDK(config.connection);
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
    let needsToMint = false;
    try {
      const accountInfo = await this.connection.getAccountInfo(playerUsdcPlusAccount);
      if (!accountInfo) {
        needsToMint = true;
      } else {
        const tokenAccount = await this.connection.getTokenAccountBalance(playerUsdcPlusAccount);
        const balance = BigInt(tokenAccount.value.amount);
        if (balance < amount) {
          needsToMint = true;
        }
      }
    } catch (error) {
      needsToMint = true;
    }

    // 3. Mint USDC+ if needed
    if (needsToMint) {
      await this.mintUsdcPlus(amount);
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

    // Use Reflect SDK to mint USDC+
    // Note: The actual Reflect SDK API may differ - this is a placeholder
    // based on typical SPL token minting patterns. Adjust based on actual SDK.
    const mintIx = await this.reflectSDK.createMintInstruction({
      amount: amount.toString(),
      sourceAccount: playerUsdcAccount,
      destinationAccount: playerUsdcPlusAccount,
      owner: this.wallet.publicKey,
    });

    tx.add(mintIx);

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
      [Buffer.from('arcium_sign_pda')],
      this.tableProgram.programId
    );

    // Derive MXE account
    const [mxeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('mxe')],
      this.arciumProgramId
    );

    // Derive mempool account
    const [mempoolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('mempool'), mxeAccount.toBuffer()],
      this.arciumProgramId
    );

    // Derive executing pool account
    const [executingPool] = PublicKey.findProgramAddressSync(
      [Buffer.from('execpool'), mxeAccount.toBuffer()],
      this.arciumProgramId
    );

    // Derive computation account
    const [computationAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('computation'),
        computationOffset.toArrayLike(Buffer, 'le', 8),
        mxeAccount.toBuffer(),
      ],
      this.arciumProgramId
    );

    // Derive computation definition account
    // comp_def_offset("place_bet") - this should match the Rust side
    const compDefOffset = this.computeCompDefOffset('place_bet');
    const [compDefAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('comp_def'), Buffer.from(compDefOffset.toString(16).padStart(8, '0'), 'hex')],
      this.arciumProgramId
    );

    // Derive cluster account
    const [clusterAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('cluster'), mxeAccount.toBuffer()],
      this.arciumProgramId
    );

    // Arcium fee pool account (constant address)
    const poolAccount = new PublicKey('ArciumFeePoolAddress11111111111111111111111'); // Placeholder

    // Arcium clock account (constant address)
    const clockAccount = SYSVAR_CLOCK_PUBKEY;

    // Derive MXE lookup table
    const [addressLookupTable] = PublicKey.findProgramAddressSync(
      [Buffer.from('lut'), mxeAccount.toBuffer()],
      this.arciumProgramId
    );

    // Address Lookup Table program
    const lutProgram = new PublicKey('AddressLookupTab1e1111111111111111111111111'); // Placeholder

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
  private computeCompDefOffset(instructionName: string): number {
    // This is a simple hash function that should match the Rust implementation
    // The actual implementation may differ - adjust based on Arcium SDK
    let hash = 0;
    for (let i = 0; i < instructionName.length; i++) {
      hash = ((hash << 5) - hash) + instructionName.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Call the current bet - matches the bet amount without revealing stack size
   * 
   * @param gameId - Unique identifier for the game
   * @returns Transaction signature
   * 
   * @example
   * ```typescript
   * const sig = await wager.callBet(gameId);
   * ```
   */
  async callBet(gameId: bigint): Promise<TransactionSignature> {
    // TODO: Implement call bet logic
    // This will use the player_action instruction with Action::Call
    throw new Error('Not implemented yet');
  }

  /**
   * Fold - exits the hand without revealing held cards or remaining stack
   * 
   * @param gameId - Unique identifier for the game
   * @returns Transaction signature
   * 
   * @example
   * ```typescript
   * const sig = await wager.fold(gameId);
   * ```
   */
  async fold(gameId: bigint): Promise<TransactionSignature> {
    // TODO: Implement fold logic
    // This will use the player_action instruction with Action::Fold
    throw new Error('Not implemented yet');
  }

  /**
   * Settle pot to winner - atomic transfer triggered by showdown result
   * 
   * @param gameId - Unique identifier for the game
   * @returns Transaction signature
   * 
   * @example
   * ```typescript
   * const sig = await wager.settleShowdown(gameId);
   * ```
   */
  async settleShowdown(gameId: bigint): Promise<TransactionSignature> {
    // TODO: Implement settle showdown logic
    // This will call the settle_showdown callback instruction
    throw new Error('Not implemented yet');
  }

  /**
   * Get encrypted balance for a player
   * 
   * Returns the ciphertext of the player's balance. Only the player can
   * decrypt this value using their private key.
   * 
   * @param playerPubkey - Player's public key
   * @returns Encrypted balance structure
   * 
   * @example
   * ```typescript
   * const encryptedBalance = await wager.getEncryptedBalance(playerPubkey);
   * ```
   */
  async getEncryptedBalance(playerPubkey: PublicKey): Promise<import('./types').EncryptedBalance> {
    // TODO: Implement get encrypted balance logic
    // This will fetch the player's C-SPL token account and return the ciphertext
    throw new Error('Not implemented yet');
  }
}
