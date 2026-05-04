/**
 * Transaction builder helpers for CerberusPoker SDK
 */

import {
  Transaction,
  VersionedTransaction,
  TransactionSignature,
  SendOptions,
  Commitment,
  TransactionMessage,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import type { AnchorWallet, ConfirmOptions } from './types';

/**
 * Transaction error with additional context
 */
export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly signature?: TransactionSignature,
    public readonly logs?: string[],
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'TransactionError';
  }
}

/**
 * Retry configuration for transaction sending
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  
  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs?: number;
  
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs?: number;
}

/**
 * Options for building versioned transactions
 */
export interface VersionedTransactionOptions {
  /** Address lookup table accounts for transaction compression */
  addressLookupTableAccounts?: AddressLookupTableAccount[];
}

/**
 * Helper class for building, signing, sending, and confirming transactions
 * 
 * Provides a clean async API for transaction management with proper error handling
 * and retry logic. Supports both legacy and versioned transactions.
 */
export class TransactionBuilder {
  private provider: AnchorProvider;
  private wallet: AnchorWallet;
  private defaultRetryConfig: Required<RetryConfig>;
  
  constructor(
    provider: AnchorProvider,
    wallet: AnchorWallet,
    retryConfig?: RetryConfig
  ) {
    this.provider = provider;
    this.wallet = wallet;
    this.defaultRetryConfig = {
      maxRetries: retryConfig?.maxRetries ?? 3,
      initialDelayMs: retryConfig?.initialDelayMs ?? 1000,
      backoffMultiplier: retryConfig?.backoffMultiplier ?? 2,
      maxDelayMs: retryConfig?.maxDelayMs ?? 10000,
    };
  }
  
  /**
   * Build a legacy transaction with recent blockhash and fee payer
   * 
   * @param transaction - Transaction to prepare
   * @param commitment - Commitment level for blockhash (default: 'confirmed')
   * @returns Prepared transaction
   * 
   * @example
   * ```typescript
   * const tx = new Transaction().add(instruction);
   * const builtTx = await txBuilder.build(tx);
   * ```
   */
  async build(
    transaction: Transaction,
    commitment: Commitment = 'confirmed'
  ): Promise<Transaction> {
    try {
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = 
        await this.provider.connection.getLatestBlockhash(commitment);
      
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = this.wallet.publicKey;
      
      return transaction;
    } catch (error) {
      throw new TransactionError(
        'Failed to build transaction: could not fetch recent blockhash',
        undefined,
        undefined,
        error
      );
    }
  }
  
  /**
   * Build a versioned transaction with recent blockhash and fee payer
   * 
   * Versioned transactions support address lookup tables for transaction compression,
   * allowing more instructions per transaction.
   * 
   * @param message - Transaction message to prepare
   * @param options - Options including address lookup tables
   * @param commitment - Commitment level for blockhash (default: 'confirmed')
   * @returns Prepared versioned transaction
   * 
   * @example
   * ```typescript
   * const message = new TransactionMessage({
   *   payerKey: wallet.publicKey,
   *   recentBlockhash: blockhash,
   *   instructions: [instruction1, instruction2],
   * });
   * const versionedTx = await txBuilder.buildVersioned(message);
   * ```
   */
  async buildVersioned(
    message: TransactionMessage,
    options?: VersionedTransactionOptions,
    commitment: Commitment = 'confirmed'
  ): Promise<VersionedTransaction> {
    try {
      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash(commitment);
      
      // Create message with updated blockhash
      const messageWithBlockhash = new TransactionMessage({
        payerKey: this.wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: message.instructions,
      });
      
      // Compile to versioned transaction
      const compiledMessage = options?.addressLookupTableAccounts
        ? messageWithBlockhash.compileToV0Message(options.addressLookupTableAccounts)
        : messageWithBlockhash.compileToV0Message();
      
      return new VersionedTransaction(compiledMessage);
    } catch (error) {
      throw new TransactionError(
        'Failed to build versioned transaction',
        undefined,
        undefined,
        error
      );
    }
  }
  
  /**
   * Sign a transaction with the wallet
   * 
   * @param transaction - Transaction to sign
   * @returns Signed transaction
   * 
   * @throws TransactionError if signing fails
   */
  async sign<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      return await this.wallet.signTransaction(transaction);
    } catch (error) {
      throw new TransactionError(
        'Failed to sign transaction: wallet rejected or unavailable',
        undefined,
        undefined,
        error
      );
    }
  }
  
  /**
   * Sign multiple transactions with the wallet
   * 
   * @param transactions - Transactions to sign
   * @returns Signed transactions
   * 
   * @throws TransactionError if signing fails
   */
  async signAll<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    try {
      return await this.wallet.signAllTransactions(transactions);
    } catch (error) {
      throw new TransactionError(
        'Failed to sign transactions: wallet rejected or unavailable',
        undefined,
        undefined,
        error
      );
    }
  }
  
  /**
   * Send a signed transaction to the network with retry logic
   * 
   * Automatically retries failed transactions with exponential backoff.
   * 
   * @param transaction - Signed transaction
   * @param options - Send options
   * @param retryConfig - Retry configuration (uses default if not provided)
   * @returns Transaction signature
   * 
   * @throws TransactionError if all retry attempts fail
   */
  async send(
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions,
    retryConfig?: RetryConfig
  ): Promise<TransactionSignature> {
    const config = { ...this.defaultRetryConfig, ...retryConfig };
    let lastError: any;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const rawTransaction = transaction.serialize();
        
        const signature = await this.provider.connection.sendRawTransaction(rawTransaction, {
          skipPreflight: options?.skipPreflight ?? false,
          maxRetries: options?.maxRetries,
        });
        
        return signature;
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw new TransactionError(
            `Transaction failed: ${error.message}`,
            undefined,
            error.logs,
            error
          );
        }
        
        // If this was the last attempt, throw
        if (attempt === config.maxRetries) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        );
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new TransactionError(
      `Transaction failed after ${config.maxRetries + 1} attempts: ${lastError?.message}`,
      undefined,
      lastError?.logs,
      lastError
    );
  }
  
  /**
   * Check if an error should not be retried
   * 
   * @param error - Error to check
   * @returns True if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    
    // Don't retry on these errors
    const nonRetryablePatterns = [
      'insufficient funds',
      'blockhash not found',
      'invalid signature',
      'account not found',
      'already processed',
      'instruction error',
    ];
    
    return nonRetryablePatterns.some(pattern => message.includes(pattern));
  }
  
  /**
   * Confirm a transaction with proper error handling
   * 
   * @param signature - Transaction signature
   * @param commitment - Commitment level
   * @returns Confirmation result
   * 
   * @throws TransactionError if confirmation fails or transaction errors
   */
  async confirm(
    signature: TransactionSignature,
    commitment: Commitment = 'confirmed'
  ): Promise<void> {
    try {
      const latestBlockhash = await this.provider.connection.getLatestBlockhash(commitment);
      
      const result = await this.provider.connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        commitment
      );
      
      // Check if transaction failed
      if (result.value.err) {
        // Fetch transaction details for logs
        const tx = await this.provider.connection.getTransaction(signature, {
          commitment,
          maxSupportedTransactionVersion: 0,
        });
        
        throw new TransactionError(
          `Transaction failed: ${JSON.stringify(result.value.err)}`,
          signature,
          tx?.meta?.logMessages || undefined,
          result.value.err
        );
      }
    } catch (error) {
      if (error instanceof TransactionError) {
        throw error;
      }
      
      throw new TransactionError(
        `Failed to confirm transaction: ${error instanceof Error ? error.message : 'unknown error'}`,
        signature,
        undefined,
        error
      );
    }
  }
  
  /**
   * Build, sign, send, and confirm a transaction in one call
   * 
   * This is the most common workflow for sending transactions.
   * Includes automatic retry logic for failed sends.
   * 
   * @param transaction - Transaction to execute
   * @param options - Confirmation options
   * @param retryConfig - Retry configuration
   * @returns Transaction signature
   * 
   * @example
   * ```typescript
   * const tx = new Transaction().add(instruction);
   * const signature = await txBuilder.buildSignSendConfirm(tx);
   * console.log('Transaction confirmed:', signature);
   * ```
   */
  async buildSignSendConfirm(
    transaction: Transaction,
    options?: ConfirmOptions,
    retryConfig?: RetryConfig
  ): Promise<TransactionSignature> {
    // Build
    const builtTx = await this.build(transaction, options?.commitment);
    
    // Sign
    const signedTx = await this.sign(builtTx);
    
    // Send with retry
    const signature = await this.send(
      signedTx,
      {
        skipPreflight: options?.skipPreflight,
        maxRetries: options?.maxRetries,
      },
      retryConfig
    );
    
    // Confirm
    await this.confirm(signature, options?.commitment);
    
    return signature;
  }
  
  /**
   * Build, sign, send, and confirm a versioned transaction in one call
   * 
   * Similar to buildSignSendConfirm but for versioned transactions.
   * 
   * @param message - Transaction message
   * @param versionedOptions - Versioned transaction options
   * @param confirmOptions - Confirmation options
   * @param retryConfig - Retry configuration
   * @returns Transaction signature
   * 
   * @example
   * ```typescript
   * const message = new TransactionMessage({
   *   payerKey: wallet.publicKey,
   *   recentBlockhash: blockhash,
   *   instructions: [instruction],
   * });
   * const signature = await txBuilder.buildSignSendConfirmVersioned(message);
   * ```
   */
  async buildSignSendConfirmVersioned(
    message: TransactionMessage,
    versionedOptions?: VersionedTransactionOptions,
    confirmOptions?: ConfirmOptions,
    retryConfig?: RetryConfig
  ): Promise<TransactionSignature> {
    // Build versioned transaction
    const versionedTx = await this.buildVersioned(
      message,
      versionedOptions,
      confirmOptions?.commitment
    );
    
    // Sign
    const signedTx = await this.sign(versionedTx);
    
    // Send with retry
    const signature = await this.send(
      signedTx,
      {
        skipPreflight: confirmOptions?.skipPreflight,
        maxRetries: confirmOptions?.maxRetries,
      },
      retryConfig
    );
    
    // Confirm
    await this.confirm(signature, confirmOptions?.commitment);
    
    return signature;
  }
  
  /**
   * Send and confirm a transaction (assumes already built and signed)
   * 
   * @param transaction - Signed transaction
   * @param options - Confirmation options
   * @param retryConfig - Retry configuration
   * @returns Transaction signature
   */
  async sendAndConfirm(
    transaction: Transaction | VersionedTransaction,
    options?: ConfirmOptions,
    retryConfig?: RetryConfig
  ): Promise<TransactionSignature> {
    const signature = await this.send(
      transaction,
      {
        skipPreflight: options?.skipPreflight,
        maxRetries: options?.maxRetries,
      },
      retryConfig
    );
    
    await this.confirm(signature, options?.commitment);
    
    return signature;
  }
  
  /**
   * Get transaction status
   * 
   * @param signature - Transaction signature
   * @param commitment - Commitment level
   * @returns Transaction status
   */
  async getStatus(
    signature: TransactionSignature,
    commitment: Commitment = 'confirmed'
  ): Promise<any> {
    return await this.provider.connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
  }
  
  /**
   * Get transaction details including logs
   * 
   * @param signature - Transaction signature
   * @param commitment - Commitment level
   * @returns Transaction details or null if not found
   */
  async getTransaction(
    signature: TransactionSignature,
    commitment: Commitment = 'confirmed'
  ): Promise<any> {
    return await this.provider.connection.getTransaction(signature, {
      commitment,
      maxSupportedTransactionVersion: 0,
    });
  }
  
  /**
   * Wait for transaction confirmation with timeout
   * 
   * @param signature - Transaction signature
   * @param timeoutMs - Timeout in milliseconds (default: 60000)
   * @param commitment - Commitment level
   * @returns True if confirmed, false if timeout
   * 
   * @throws TransactionError if transaction fails
   */
  async waitForConfirmation(
    signature: TransactionSignature,
    timeoutMs: number = 60000,
    commitment: Commitment = 'confirmed'
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getStatus(signature, commitment);
      
      if (status.value?.confirmationStatus === commitment || 
          status.value?.confirmationStatus === 'finalized') {
        // Check for errors
        if (status.value?.err) {
          const tx = await this.getTransaction(signature, commitment);
          throw new TransactionError(
            `Transaction failed: ${JSON.stringify(status.value.err)}`,
            signature,
            tx?.meta?.logMessages || undefined,
            status.value.err
          );
        }
        return true;
      }
      
      if (status.value?.err) {
        const tx = await this.getTransaction(signature, commitment);
        throw new TransactionError(
          `Transaction failed: ${JSON.stringify(status.value.err)}`,
          signature,
          tx?.meta?.logMessages || undefined,
          status.value.err
        );
      }
      
      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
  }
  
  /**
   * Simulate a transaction before sending
   * 
   * Useful for testing transactions and estimating compute units.
   * 
   * @param transaction - Transaction to simulate
   * @param commitment - Commitment level
   * @returns Simulation result
   * 
   * @throws TransactionError if simulation fails
   */
  async simulate(
    transaction: Transaction | VersionedTransaction,
    commitment: Commitment = 'confirmed'
  ): Promise<any> {
    try {
      if (transaction instanceof Transaction) {
        return await this.provider.connection.simulateTransaction(transaction, {
          commitment,
        });
      } else {
        return await this.provider.connection.simulateTransaction(transaction, {
          commitment,
        });
      }
    } catch (error) {
      throw new TransactionError(
        `Transaction simulation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        undefined,
        undefined,
        error
      );
    }
  }
  
  /**
   * Get recent prioritization fees for better transaction landing
   * 
   * @param addresses - Optional addresses to get fees for
   * @returns Recent prioritization fees
   */
  async getRecentPrioritizationFees(addresses?: string[]): Promise<any> {
    return await this.provider.connection.getRecentPrioritizationFees({
      lockedWritableAccounts: addresses,
    });
  }
  
  /**
   * Update retry configuration
   * 
   * @param config - New retry configuration
   */
  setRetryConfig(config: RetryConfig): void {
    this.defaultRetryConfig = {
      ...this.defaultRetryConfig,
      ...config,
    };
  }
  
  /**
   * Get current retry configuration
   * 
   * @returns Current retry configuration
   */
  getRetryConfig(): Required<RetryConfig> {
    return { ...this.defaultRetryConfig };
  }
}
