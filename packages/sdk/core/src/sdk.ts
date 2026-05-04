/**
 * CerberusPokerSDK — Main entry point for the SDK
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { getArciumEnv, ArciumEnv } from '@arcium-hq/client';
import type {
  SDKConfig,
  AnchorWallet,
  GameState,
  RevealedCard,
  BettingEvent,
  Unsubscribe,
} from './types';
import { EventManager } from './events';
import { TransactionBuilder } from './transaction-builder';
import { WalletManager, WalletType, detectAvailableWallets } from './wallet-adapter';

/**
 * Main SDK class that composes deck and wager modules
 * 
 * @example
 * ```typescript
 * // Option 1: Use with an existing wallet adapter
 * import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
 * import { createAnchorWallet } from '@cerberus-poker/core';
 * 
 * const adapter = new PhantomWalletAdapter();
 * await adapter.connect();
 * const wallet = createAnchorWallet(adapter);
 * 
 * const sdk = await CerberusPokerSDK.create({
 *   connection: new Connection('https://api.devnet.solana.com'),
 *   wallet,
 *   programId: new PublicKey('...'),
 *   clusterOffset: 456, // devnet
 * });
 * 
 * // Option 2: Use the built-in wallet manager
 * const manager = new WalletManager();
 * const wallet = await manager.connect(adapter);
 * 
 * const sdk = await CerberusPokerSDK.create({
 *   connection: new Connection('https://api.devnet.solana.com'),
 *   wallet,
 *   programId: new PublicKey('...'),
 *   clusterOffset: 456,
 * });
 * 
 * // Subscribe to game events
 * sdk.onGameStateChange(gameId, (state) => {
 *   console.log('Game state changed:', state);
 * });
 * 
 * // Use deck module (task 17)
 * // await sdk.deck.shuffleDeck(gameId);
 * 
 * // Use wager module (task 18)
 * // await sdk.wager.placeBet(gameId, 1000n);
 * ```
 */
export class CerberusPokerSDK {
  /** Solana connection */
  public readonly connection: Connection;
  
  /** Wallet adapter */
  public readonly wallet: AnchorWallet;
  
  /** Anchor provider */
  public readonly provider: AnchorProvider;
  
  /** CerberusPoker program */
  public readonly program: Program;
  
  /** Arcium environment */
  public readonly arciumEnv: ArciumEnv;
  
  /** Arcium cluster offset */
  public readonly clusterOffset: number;
  
  /** C-SPL token mint (optional) */
  public readonly cSplMint?: PublicKey;
  
  /** Event manager for subscriptions */
  private readonly eventManager: EventManager;
  
  /** Transaction builder */
  public readonly txBuilder: TransactionBuilder;
  
  // Deck and wager modules will be added in tasks 17 and 18
  // public readonly deck: DeckModule;
  // public readonly wager: WagerModule;
  
  /**
   * Private constructor — use CerberusPokerSDK.create() instead
   */
  private constructor(config: SDKConfig, provider: AnchorProvider, program: Program, arciumEnv: ArciumEnv) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.provider = provider;
    this.program = program;
    this.arciumEnv = arciumEnv;
    this.clusterOffset = config.clusterOffset;
    this.cSplMint = config.cSplMint;
    
    this.eventManager = new EventManager(this.connection, this.program);
    this.txBuilder = new TransactionBuilder(this.provider, this.wallet);
    
    // Initialize modules (tasks 17 and 18)
    // this.deck = new DeckModule(this.program, this.provider, this.clusterOffset);
    // this.wager = new WagerModule(this.connection, this.wallet, this.program, this.cSplMint);
  }
  
  /**
   * Create a new CerberusPokerSDK instance
   * 
   * This is the main entry point for initializing the SDK. It sets up the
   * Anchor provider, loads the program IDL, and initializes the Arcium environment.
   * 
   * @param config - SDK configuration
   * @returns Initialized SDK instance
   * 
   * @throws Error if program IDL cannot be loaded
   * @throws Error if Arcium environment initialization fails
   */
  static async create(config: SDKConfig): Promise<CerberusPokerSDK> {
    // Create Anchor provider
    const provider = new AnchorProvider(
      config.connection,
      config.wallet,
      { commitment: 'confirmed' }
    );
    
    // Load program IDL
    // In a real implementation, we would fetch the IDL from the program
    // For now, we'll use a placeholder
    const program = new Program(
      {} as any, // IDL placeholder
      config.programId,
      provider
    );
    
    // Initialize Arcium environment
    const arciumEnv = await getArciumEnv(
      config.connection,
      config.clusterOffset
    );
    
    return new CerberusPokerSDK(config, provider, program, arciumEnv);
  }
  
  /**
   * Detect which wallets are available in the browser
   * 
   * This is a convenience method that checks which supported wallets
   * are installed in the user's browser.
   * 
   * @returns Object with boolean flags for each supported wallet
   * 
   * @example
   * ```typescript
   * const available = CerberusPokerSDK.detectWallets();
   * if (available.phantom) {
   *   console.log('Phantom is available');
   * }
   * if (available.backpack) {
   *   console.log('Backpack is available');
   * }
   * ```
   */
  static detectWallets(): { phantom: boolean; backpack: boolean } {
    return detectAvailableWallets();
  }
  
  /**
   * Create a wallet manager for handling wallet connections
   * 
   * This is a convenience method that creates a WalletManager instance
   * for managing wallet connections and state.
   * 
   * @returns New WalletManager instance
   * 
   * @example
   * ```typescript
   * const manager = CerberusPokerSDK.createWalletManager();
   * 
   * // Listen for state changes
   * manager.onStateChange((state) => {
   *   console.log('Wallet state:', state);
   * });
   * 
   * // Connect to Phantom
   * const adapter = await getWalletAdapter(WalletType.Phantom);
   * const wallet = await manager.connect(adapter);
   * 
   * // Create SDK with connected wallet
   * const sdk = await CerberusPokerSDK.create({
   *   connection,
   *   wallet,
   *   programId,
   *   clusterOffset: 456,
   * });
   * ```
   */
  static createWalletManager(): WalletManager {
    return new WalletManager();
  }
  
  /**
   * Subscribe to game state changes
   * 
   * @param gameId - Game ID to monitor
   * @param callback - Callback function called when state changes
   * @returns Unsubscribe function
   * 
   * @example
   * ```typescript
   * const unsubscribe = sdk.onGameStateChange(gameId, (state) => {
   *   console.log('New state:', state);
   * });
   * 
   * // Later, to stop listening:
   * unsubscribe();
   * ```
   */
  onGameStateChange(gameId: bigint, callback: (state: GameState) => void): Unsubscribe {
    return this.eventManager.onGameStateChange(gameId, callback);
  }
  
  /**
   * Subscribe to card reveal events
   * 
   * @param gameId - Game ID to monitor
   * @param callback - Callback function called when a card is revealed
   * @returns Unsubscribe function
   * 
   * @example
   * ```typescript
   * const unsubscribe = sdk.onCardRevealed(gameId, (card) => {
   *   console.log('Card revealed:', card.cardValue);
   * });
   * ```
   */
  onCardRevealed(gameId: bigint, callback: (card: RevealedCard) => void): Unsubscribe {
    return this.eventManager.onCardRevealed(gameId, callback);
  }
  
  /**
   * Subscribe to betting action events
   * 
   * @param gameId - Game ID to monitor
   * @param callback - Callback function called when a player acts
   * @returns Unsubscribe function
   * 
   * @example
   * ```typescript
   * const unsubscribe = sdk.onBettingAction(gameId, (event) => {
   *   console.log(`Player ${event.playerIndex} ${event.action}`);
   * });
   * ```
   */
  onBettingAction(gameId: bigint, callback: (event: BettingEvent) => void): Unsubscribe {
    return this.eventManager.onBettingAction(gameId, callback);
  }
  
  /**
   * Get the GameSession PDA for a given game ID
   * 
   * @param gameId - Game ID
   * @returns GameSession PDA and bump seed
   */
  getGameSessionPda(gameId: bigint): [PublicKey, number] {
    const gameIdBuffer = Buffer.alloc(8);
    gameIdBuffer.writeBigUInt64LE(gameId);
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBuffer],
      this.program.programId
    );
  }
  
  /**
   * Get the PokerTable PDA for a given game ID
   * 
   * @param gameId - Game ID
   * @returns PokerTable PDA and bump seed
   */
  getPokerTablePda(gameId: bigint): [PublicKey, number] {
    const gameIdBuffer = Buffer.alloc(8);
    gameIdBuffer.writeBigUInt64LE(gameId);
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('table'), gameIdBuffer],
      this.program.programId
    );
  }
  
  /**
   * Fetch GameSession account data
   * 
   * @param gameId - Game ID
   * @returns GameSession account data
   */
  async getGameSession(gameId: bigint): Promise<any> {
    const [pda] = this.getGameSessionPda(gameId);
    return await this.program.account.gameSession.fetch(pda);
  }
  
  /**
   * Fetch PokerTable account data
   * 
   * @param gameId - Game ID
   * @returns PokerTable account data
   */
  async getPokerTable(gameId: bigint): Promise<any> {
    const [pda] = this.getPokerTablePda(gameId);
    return await this.program.account.pokerTable.fetch(pda);
  }
  
  /**
   * Close all event subscriptions
   * 
   * Call this when you're done with the SDK to clean up resources.
   */
  close(): void {
    this.eventManager.closeAll();
  }
}
