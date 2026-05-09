/**
 * CerberusPokerSDK — Main entry point for the SDK
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
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

type ArciumEnv = unknown;

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
  
  /** CerberusPoker protocol program */
  public readonly cerberusProgram: Program;

  /** Texas Hold'em reference program */
  public readonly texasHoldemProgram: Program;

  /** Backward-compatible alias for cerberusProgram */
  public readonly program: Program;
  
  /** Arcium environment */
  public readonly arciumEnv: ArciumEnv;
  
  /** Arcium cluster offset */
  public readonly clusterOffset: number;
  
  /** C-SPL token mint (optional) */
  public readonly cSplMint: PublicKey | undefined;
  
  /** Event manager for subscriptions */
  private readonly gameEventManager: EventManager;

  /** Event manager for Texas Hold'em table accounts */
  private readonly tableEventManager: EventManager;
  
  /** Transaction builder */
  public readonly txBuilder: TransactionBuilder;
  
  // Deck and wager modules will be added in tasks 17 and 18
  // public readonly deck: DeckModule;
  // public readonly wager: WagerModule;
  
  /**
   * Private constructor — use CerberusPokerSDK.create() instead
   */
  private constructor(
    config: SDKConfig,
    provider: AnchorProvider,
    cerberusProgram: Program,
    texasHoldemProgram: Program,
    arciumEnv: ArciumEnv
  ) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.provider = provider;
    this.cerberusProgram = cerberusProgram;
    this.texasHoldemProgram = texasHoldemProgram;
    this.program = cerberusProgram;
    this.arciumEnv = arciumEnv;
    this.clusterOffset = config.clusterOffset;
    this.cSplMint = config.cSplMint;
    
    this.gameEventManager = new EventManager(this.connection, this.cerberusProgram);
    this.tableEventManager = new EventManager(this.connection, this.texasHoldemProgram);
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
    
    const cerberusProgramId = config.cerberusProgramId ?? config.programId;
    if (!cerberusProgramId) {
      throw new Error('cerberusProgramId is required');
    }
    if (!config.texasHoldemProgramId) {
      throw new Error('texasHoldemProgramId is required');
    }

    const cerberusIdl = await this.loadIdl(
      config.cerberusIdl,
      cerberusProgramId,
      provider,
      'cerberus_poker'
    );
    const texasHoldemIdl = await this.loadIdl(
      config.texasHoldemIdl,
      config.texasHoldemProgramId,
      provider,
      'texas_holdem'
    );

    const cerberusProgram = new Program(
      this.withProgramAddress(cerberusIdl, cerberusProgramId),
      provider
    );
    const texasHoldemProgram = new Program(
      this.withProgramAddress(texasHoldemIdl, config.texasHoldemProgramId),
      provider
    );

    return new CerberusPokerSDK(
      config,
      provider,
      cerberusProgram,
      texasHoldemProgram,
      config.arciumEnv ?? null
    );
  }

  private static async loadIdl(
    idl: Idl | undefined,
    programId: PublicKey,
    provider: AnchorProvider,
    name: string
  ): Promise<Idl> {
    if (idl) return idl;

    const fetched = await Program.fetchIdl(programId, provider);
    if (!fetched) {
      throw new Error(`Unable to load ${name} IDL for program ${programId.toBase58()}`);
    }

    return fetched;
  }

  private static withProgramAddress(idl: Idl, programId: PublicKey): Idl {
    return {
      ...idl,
      address: programId.toBase58(),
    } as Idl;
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
    return this.gameEventManager.onGameStateChange(gameId, callback);
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
    return this.gameEventManager.onCardRevealed(gameId, callback);
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
    return this.tableEventManager.onBettingAction(gameId, callback);
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
      this.texasHoldemProgram.programId
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
    return await (this.cerberusProgram.account as any).gameSession.fetch(pda);
  }
  
  /**
   * Fetch PokerTable account data
   * 
   * @param gameId - Game ID
   * @returns PokerTable account data
   */
  async getPokerTable(gameId: bigint): Promise<any> {
    const [pda] = this.getPokerTablePda(gameId);
    return await (this.texasHoldemProgram.account as any).pokerTable.fetch(pda);
  }
  
  /**
   * Close all event subscriptions
   * 
   * Call this when you're done with the SDK to clean up resources.
   */
  close(): void {
    this.gameEventManager.closeAll();
    this.tableEventManager.closeAll();
  }
}
