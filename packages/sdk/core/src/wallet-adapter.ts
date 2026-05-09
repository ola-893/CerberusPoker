/**
 * Wallet adapter utilities for Phantom and Backpack integration
 * 
 * This module provides utilities for integrating Solana wallet adapters
 * with the CerberusPoker SDK, following best practices from @solana/wallet-adapter-react.
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { WalletAdapter } from '@solana/wallet-adapter-base';
import type { AnchorWallet } from './types';

/**
 * Supported wallet types
 */
export enum WalletType {
  Phantom = 'Phantom',
  Backpack = 'Backpack',
}

/**
 * Wallet connection state
 */
export enum WalletConnectionState {
  Disconnected = 'Disconnected',
  Connecting = 'Connecting',
  Connected = 'Connected',
  Disconnecting = 'Disconnecting',
}

/**
 * Wallet adapter wrapper that implements the AnchorWallet interface
 * 
 * This class wraps a standard Solana wallet adapter and provides the
 * AnchorWallet interface required by the SDK.
 * 
 * @example
 * ```typescript
 * import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
 * 
 * const phantomAdapter = new PhantomWalletAdapter();
 * await phantomAdapter.connect();
 * 
 * const anchorWallet = new WalletAdapterWrapper(phantomAdapter);
 * const sdk = await CerberusPokerSDK.create({
 *   connection,
 *   wallet: anchorWallet,
 *   programId,
 *   clusterOffset: 456,
 * });
 * ```
 */
export class WalletAdapterWrapper implements AnchorWallet {
  constructor(private adapter: WalletAdapter) {
    if (!adapter.publicKey) {
      throw new Error('Wallet adapter must be connected before wrapping');
    }
  }

  /**
   * Get the wallet's public key
   */
  get publicKey(): PublicKey {
    if (!this.adapter.publicKey) {
      throw new Error('Wallet not connected');
    }
    return this.adapter.publicKey;
  }

  /**
   * Sign a transaction
   * 
   * @param tx - Transaction to sign
   * @returns Signed transaction
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const signer = this.adapter as any;
    if (!signer.signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }
    return await signer.signTransaction(tx);
  }

  /**
   * Sign multiple transactions
   * 
   * @param txs - Transactions to sign
   * @returns Signed transactions
   */
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    const signer = this.adapter as any;
    if (!signer.signAllTransactions) {
      throw new Error('Wallet does not support batch transaction signing');
    }
    return await signer.signAllTransactions(txs);
  }
}

/**
 * Wallet manager for handling wallet connections and state
 * 
 * This class provides a higher-level API for managing wallet connections,
 * handling connection state, and providing event callbacks.
 * 
 * @example
 * ```typescript
 * import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
 * 
 * const manager = new WalletManager();
 * 
 * // Listen for connection state changes
 * manager.onStateChange((state) => {
 *   console.log('Wallet state:', state);
 * });
 * 
 * // Connect to Phantom
 * const phantomAdapter = new PhantomWalletAdapter();
 * const wallet = await manager.connect(phantomAdapter);
 * 
 * // Use with SDK
 * const sdk = await CerberusPokerSDK.create({
 *   connection,
 *   wallet,
 *   programId,
 *   clusterOffset: 456,
 * });
 * 
 * // Disconnect when done
 * await manager.disconnect();
 * ```
 */
export class WalletManager {
  private adapter: WalletAdapter | null = null;
  private anchorWallet: AnchorWallet | null = null;
  private state: WalletConnectionState = WalletConnectionState.Disconnected;
  private stateChangeCallbacks: Array<(state: WalletConnectionState) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  /**
   * Get the current connection state
   */
  getState(): WalletConnectionState {
    return this.state;
  }

  /**
   * Get the current wallet adapter
   */
  getAdapter(): WalletAdapter | null {
    return this.adapter;
  }

  /**
   * Get the current AnchorWallet instance
   */
  getWallet(): AnchorWallet | null {
    return this.anchorWallet;
  }

  /**
   * Check if a wallet is connected
   */
  isConnected(): boolean {
    return this.state === WalletConnectionState.Connected && this.anchorWallet !== null;
  }

  /**
   * Register a callback for state changes
   * 
   * @param callback - Function to call when state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: (state: WalletConnectionState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register a callback for errors
   * 
   * @param callback - Function to call when an error occurs
   * @returns Unsubscribe function
   */
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Connect to a wallet
   * 
   * @param adapter - Wallet adapter to connect to
   * @returns AnchorWallet instance
   * 
   * @throws Error if connection fails
   * @throws Error if already connected to a different wallet
   */
  async connect(adapter: WalletAdapter): Promise<AnchorWallet> {
    if (this.state === WalletConnectionState.Connecting) {
      throw new Error('Already connecting to a wallet');
    }

    if (this.state === WalletConnectionState.Connected && this.adapter !== adapter) {
      throw new Error('Already connected to a different wallet. Disconnect first.');
    }

    try {
      this.setState(WalletConnectionState.Connecting);
      this.adapter = adapter;

      // Set up adapter event listeners
      this.setupAdapterListeners(adapter);

      // Connect if not already connected
      if (!adapter.connected) {
        await adapter.connect();
      }

      // Verify we have a public key
      if (!adapter.publicKey) {
        throw new Error('Wallet connected but no public key available');
      }

      // Create AnchorWallet wrapper
      this.anchorWallet = new WalletAdapterWrapper(adapter);
      this.setState(WalletConnectionState.Connected);

      return this.anchorWallet;
    } catch (error) {
      this.setState(WalletConnectionState.Disconnected);
      this.adapter = null;
      this.anchorWallet = null;
      
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  /**
   * Disconnect from the current wallet
   */
  async disconnect(): Promise<void> {
    if (this.state === WalletConnectionState.Disconnected) {
      return;
    }

    if (this.state === WalletConnectionState.Disconnecting) {
      throw new Error('Already disconnecting');
    }

    try {
      this.setState(WalletConnectionState.Disconnecting);

      if (this.adapter) {
        // Remove event listeners
        this.cleanupAdapterListeners(this.adapter);

        // Disconnect the adapter
        if (this.adapter.connected) {
          await this.adapter.disconnect();
        }
      }

      this.adapter = null;
      this.anchorWallet = null;
      this.setState(WalletConnectionState.Disconnected);
    } catch (error) {
      // Even if disconnect fails, reset state
      this.adapter = null;
      this.anchorWallet = null;
      this.setState(WalletConnectionState.Disconnected);
      
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  /**
   * Set up event listeners on the wallet adapter
   */
  private setupAdapterListeners(adapter: WalletAdapter): void {
    adapter.on('connect', this.handleAdapterConnect);
    adapter.on('disconnect', this.handleAdapterDisconnect);
    adapter.on('error', this.handleAdapterError);
  }

  /**
   * Clean up event listeners from the wallet adapter
   */
  private cleanupAdapterListeners(adapter: WalletAdapter): void {
    adapter.off('connect', this.handleAdapterConnect);
    adapter.off('disconnect', this.handleAdapterDisconnect);
    adapter.off('error', this.handleAdapterError);
  }

  /**
   * Handle adapter connect event
   */
  private handleAdapterConnect = (): void => {
    // Connection is handled in the connect() method
    // This is just for logging/debugging
  };

  /**
   * Handle adapter disconnect event
   */
  private handleAdapterDisconnect = (): void => {
    // If the adapter disconnects unexpectedly, update our state
    if (this.state !== WalletConnectionState.Disconnecting) {
      this.adapter = null;
      this.anchorWallet = null;
      this.setState(WalletConnectionState.Disconnected);
    }
  };

  /**
   * Handle adapter error event
   */
  private handleAdapterError = (error: Error): void => {
    this.notifyError(error);
  };

  /**
   * Update the connection state and notify listeners
   */
  private setState(newState: WalletConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeCallbacks.forEach(callback => {
        try {
          callback(newState);
        } catch (error) {
          console.error('Error in state change callback:', error);
        }
      });
    }
  }

  /**
   * Notify error listeners
   */
  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in error callback:', err);
      }
    });
  }
}

/**
 * Detect available wallets in the browser
 * 
 * @returns Object with boolean flags for each supported wallet
 * 
 * @example
 * ```typescript
 * const available = detectAvailableWallets();
 * if (available.phantom) {
 *   console.log('Phantom wallet is available');
 * }
 * if (available.backpack) {
 *   console.log('Backpack wallet is available');
 * }
 * ```
 */
export function detectAvailableWallets(): {
  phantom: boolean;
  backpack: boolean;
} {
  // Check for Phantom
  const hasPhantom = typeof window !== 'undefined' && 
    'solana' in window && 
    (window as any).solana?.isPhantom === true;

  // Check for Backpack
  const hasBackpack = typeof window !== 'undefined' && 
    'backpack' in window && 
    (window as any).backpack?.isBackpack === true;

  return {
    phantom: hasPhantom,
    backpack: hasBackpack,
  };
}

/**
 * Get wallet adapter by type
 * 
 * This is a convenience function that creates the appropriate wallet adapter
 * based on the wallet type. Note that the wallet must be installed in the browser.
 * 
 * @param type - Wallet type to get adapter for
 * @returns Wallet adapter instance
 * 
 * @throws Error if wallet is not available
 * 
 * @example
 * ```typescript
 * import { getWalletAdapter, WalletType } from '@cerberus-poker/core';
 * 
 * const adapter = getWalletAdapter(WalletType.Phantom);
 * const manager = new WalletManager();
 * const wallet = await manager.connect(adapter);
 * ```
 */
export async function getWalletAdapter(type: WalletType): Promise<WalletAdapter> {
  const available = detectAvailableWallets();

  switch (type) {
    case WalletType.Phantom: {
      if (!available.phantom) {
        throw new Error('Phantom wallet is not installed. Please install it from https://phantom.app/');
      }
      const { PhantomWalletAdapter } = await import('@solana/wallet-adapter-phantom');
      return new PhantomWalletAdapter();
    }

    case WalletType.Backpack: {
      if (!available.backpack) {
        throw new Error('Backpack wallet is not installed. Please install it from https://backpack.app/');
      }
      const { BackpackWalletAdapter } = await import('@solana/wallet-adapter-backpack');
      return new BackpackWalletAdapter();
    }

    default:
      throw new Error(`Unsupported wallet type: ${type}`);
  }
}

/**
 * Create an AnchorWallet from a standard wallet adapter
 * 
 * This is a convenience function that wraps a wallet adapter in the
 * AnchorWallet interface. The adapter must already be connected.
 * 
 * @param adapter - Connected wallet adapter
 * @returns AnchorWallet instance
 * 
 * @throws Error if adapter is not connected
 * 
 * @example
 * ```typescript
 * import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
 * import { createAnchorWallet } from '@cerberus-poker/core';
 * 
 * const adapter = new PhantomWalletAdapter();
 * await adapter.connect();
 * 
 * const wallet = createAnchorWallet(adapter);
 * const sdk = await CerberusPokerSDK.create({
 *   connection,
 *   wallet,
 *   programId,
 *   clusterOffset: 456,
 * });
 * ```
 */
export function createAnchorWallet(adapter: WalletAdapter): AnchorWallet {
  return new WalletAdapterWrapper(adapter);
}
