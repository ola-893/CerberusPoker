/**
 * Tests for TransactionBuilder
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
  SystemProgram,
  TransactionMessage,
  Commitment,
} from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import {
  TransactionBuilder,
  TransactionError,
  RetryConfig,
} from '../transaction-builder';
import type { AnchorWallet } from '../types';

// Mock wallet
const createMockWallet = (): AnchorWallet => {
  const publicKey = new PublicKey('11111111111111111111111111111111');
  
  return {
    publicKey,
    signTransaction: vi.fn(async (tx) => tx),
    signAllTransactions: vi.fn(async (txs) => txs),
  };
};

// Mock connection
const createMockConnection = () => {
  const connection = {
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: 'mock-blockhash',
      lastValidBlockHeight: 1000,
    })),
    sendRawTransaction: vi.fn(async () => 'mock-signature'),
    confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    getSignatureStatus: vi.fn(async () => ({
      value: {
        confirmationStatus: 'confirmed',
        err: null,
      },
    })),
    getTransaction: vi.fn(async () => ({
      meta: {
        logMessages: ['Program log: Success'],
      },
    })),
    simulateTransaction: vi.fn(async () => ({
      value: {
        err: null,
        logs: ['Program log: Success'],
      },
    })),
    getRecentPrioritizationFees: vi.fn(async () => []),
  } as any;
  
  return connection;
};

describe('TransactionBuilder', () => {
  let wallet: AnchorWallet;
  let connection: Connection;
  let provider: AnchorProvider;
  let txBuilder: TransactionBuilder;
  
  beforeEach(() => {
    wallet = createMockWallet();
    connection = createMockConnection();
    provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    txBuilder = new TransactionBuilder(provider, wallet);
  });
  
  describe('constructor', () => {
    it('should create instance with default retry config', () => {
      const builder = new TransactionBuilder(provider, wallet);
      const config = builder.getRetryConfig();
      
      expect(config.maxRetries).toBe(3);
      expect(config.initialDelayMs).toBe(1000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.maxDelayMs).toBe(10000);
    });
    
    it('should create instance with custom retry config', () => {
      const customConfig: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 500,
        backoffMultiplier: 1.5,
        maxDelayMs: 5000,
      };
      
      const builder = new TransactionBuilder(provider, wallet, customConfig);
      const config = builder.getRetryConfig();
      
      expect(config.maxRetries).toBe(5);
      expect(config.initialDelayMs).toBe(500);
      expect(config.backoffMultiplier).toBe(1.5);
      expect(config.maxDelayMs).toBe(5000);
    });
  });
  
  describe('build', () => {
    it('should build a transaction with blockhash and fee payer', async () => {
      const tx = new Transaction();
      const instruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1000,
      });
      tx.add(instruction);
      
      const builtTx = await txBuilder.build(tx);
      
      expect(builtTx.recentBlockhash).toBe('mock-blockhash');
      expect(builtTx.lastValidBlockHeight).toBe(1000);
      expect(builtTx.feePayer?.toString()).toBe(wallet.publicKey.toString());
      expect(connection.getLatestBlockhash).toHaveBeenCalledWith('confirmed');
    });
    
    it('should build with custom commitment', async () => {
      const tx = new Transaction();
      await txBuilder.build(tx, 'finalized');
      
      expect(connection.getLatestBlockhash).toHaveBeenCalledWith('finalized');
    });
    
    it('should throw TransactionError on failure', async () => {
      connection.getLatestBlockhash = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const tx = new Transaction();
      
      await expect(txBuilder.build(tx)).rejects.toThrow(TransactionError);
      await expect(txBuilder.build(tx)).rejects.toThrow('could not fetch recent blockhash');
    });
  });
  
  describe('buildVersioned', () => {
    it('should build a versioned transaction', async () => {
      const instruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1000,
      });
      
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: 'old-blockhash',
        instructions: [instruction],
      });
      
      const versionedTx = await txBuilder.buildVersioned(message);
      
      expect(versionedTx).toBeInstanceOf(VersionedTransaction);
      expect(connection.getLatestBlockhash).toHaveBeenCalledWith('confirmed');
    });
    
    it('should throw TransactionError on failure', async () => {
      connection.getLatestBlockhash = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: 'blockhash',
        instructions: [],
      });
      
      await expect(txBuilder.buildVersioned(message)).rejects.toThrow(TransactionError);
    });
  });
  
  describe('sign', () => {
    it('should sign a transaction', async () => {
      const tx = new Transaction();
      const signedTx = await txBuilder.sign(tx);
      
      expect(wallet.signTransaction).toHaveBeenCalledWith(tx);
      expect(signedTx).toBe(tx);
    });
    
    it('should throw TransactionError on signing failure', async () => {
      wallet.signTransaction = vi.fn().mockRejectedValue(new Error('User rejected'));
      
      const tx = new Transaction();
      
      await expect(txBuilder.sign(tx)).rejects.toThrow(TransactionError);
      await expect(txBuilder.sign(tx)).rejects.toThrow('wallet rejected or unavailable');
    });
  });
  
  describe('signAll', () => {
    it('should sign multiple transactions', async () => {
      const tx1 = new Transaction();
      const tx2 = new Transaction();
      const txs = [tx1, tx2];
      
      const signedTxs = await txBuilder.signAll(txs);
      
      expect(wallet.signAllTransactions).toHaveBeenCalledWith(txs);
      expect(signedTxs).toEqual(txs);
    });
    
    it('should throw TransactionError on signing failure', async () => {
      wallet.signAllTransactions = vi.fn().mockRejectedValue(new Error('User rejected'));
      
      const txs = [new Transaction()];
      
      await expect(txBuilder.signAll(txs)).rejects.toThrow(TransactionError);
    });
  });
  
  describe('send', () => {
    it('should send a transaction successfully', async () => {
      const tx = new Transaction();
      tx.recentBlockhash = 'blockhash';
      tx.feePayer = wallet.publicKey;
      
      // Mock serialize
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      const signature = await txBuilder.send(tx);
      
      expect(signature).toBe('mock-signature');
      expect(connection.sendRawTransaction).toHaveBeenCalled();
    });
    
    it('should retry on retryable errors', async () => {
      const tx = new Transaction();
      tx.recentBlockhash = 'blockhash';
      tx.feePayer = wallet.publicKey;
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      // Fail twice, then succeed
      connection.sendRawTransaction = vi.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('mock-signature');
      
      const signature = await txBuilder.send(tx, undefined, { maxRetries: 3 });
      
      expect(signature).toBe('mock-signature');
      expect(connection.sendRawTransaction).toHaveBeenCalledTimes(3);
    });
    
    it('should not retry on non-retryable errors', async () => {
      const tx = new Transaction();
      tx.recentBlockhash = 'blockhash';
      tx.feePayer = wallet.publicKey;
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      connection.sendRawTransaction = vi.fn()
        .mockRejectedValue(new Error('Insufficient funds'));
      
      await expect(txBuilder.send(tx)).rejects.toThrow(TransactionError);
      expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1);
    });
    
    it('should throw after max retries', async () => {
      const tx = new Transaction();
      tx.recentBlockhash = 'blockhash';
      tx.feePayer = wallet.publicKey;
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      connection.sendRawTransaction = vi.fn()
        .mockRejectedValue(new Error('Network timeout'));
      
      await expect(txBuilder.send(tx, undefined, { maxRetries: 2 })).rejects.toThrow(TransactionError);
      expect(connection.sendRawTransaction).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });
  
  describe('confirm', () => {
    it('should confirm a transaction successfully', async () => {
      await txBuilder.confirm('mock-signature');
      
      expect(connection.getLatestBlockhash).toHaveBeenCalled();
      expect(connection.confirmTransaction).toHaveBeenCalled();
    });
    
    it('should throw TransactionError if transaction failed', async () => {
      connection.confirmTransaction = vi.fn().mockResolvedValue({
        value: { err: { InstructionError: [0, 'Custom error'] } },
      });
      
      await expect(txBuilder.confirm('mock-signature')).rejects.toThrow(TransactionError);
    });
    
    it('should include logs in error', async () => {
      connection.confirmTransaction = vi.fn().mockResolvedValue({
        value: { err: { InstructionError: [0, 'Custom error'] } },
      });
      
      connection.getTransaction = vi.fn().mockResolvedValue({
        meta: {
          logMessages: ['Program log: Error', 'Program log: Failed'],
        },
      });
      
      try {
        await txBuilder.confirm('mock-signature');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError);
        expect((error as TransactionError).logs).toEqual([
          'Program log: Error',
          'Program log: Failed',
        ]);
      }
    });
  });
  
  describe('buildSignSendConfirm', () => {
    it('should execute full transaction flow', async () => {
      const tx = new Transaction();
      const instruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1000,
      });
      tx.add(instruction);
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      const signature = await txBuilder.buildSignSendConfirm(tx);
      
      expect(signature).toBe('mock-signature');
      expect(connection.getLatestBlockhash).toHaveBeenCalled();
      expect(wallet.signTransaction).toHaveBeenCalled();
      expect(connection.sendRawTransaction).toHaveBeenCalled();
      expect(connection.confirmTransaction).toHaveBeenCalled();
    });
    
    it('should pass options correctly', async () => {
      const tx = new Transaction();
      tx.add(SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1000,
      }));
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      await txBuilder.buildSignSendConfirm(tx, {
        commitment: 'finalized',
        skipPreflight: true,
      });
      
      expect(connection.getLatestBlockhash).toHaveBeenCalledWith('finalized');
      expect(connection.sendRawTransaction).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ skipPreflight: true })
      );
    });
  });
  
  describe('buildSignSendConfirmVersioned', () => {
    it('should execute full versioned transaction flow', async () => {
      const instruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1000,
      });
      
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: 'blockhash',
        instructions: [instruction],
      });
      
      const signature = await txBuilder.buildSignSendConfirmVersioned(message);
      
      expect(signature).toBe('mock-signature');
      expect(connection.getLatestBlockhash).toHaveBeenCalled();
      expect(wallet.signTransaction).toHaveBeenCalled();
      expect(connection.sendRawTransaction).toHaveBeenCalled();
      expect(connection.confirmTransaction).toHaveBeenCalled();
    });
  });
  
  describe('sendAndConfirm', () => {
    it('should send and confirm a transaction', async () => {
      const tx = new Transaction();
      tx.recentBlockhash = 'blockhash';
      tx.feePayer = wallet.publicKey;
      tx.serialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
      
      const signature = await txBuilder.sendAndConfirm(tx);
      
      expect(signature).toBe('mock-signature');
      expect(connection.sendRawTransaction).toHaveBeenCalled();
      expect(connection.confirmTransaction).toHaveBeenCalled();
    });
  });
  
  describe('getStatus', () => {
    it('should get transaction status', async () => {
      const status = await txBuilder.getStatus('mock-signature');
      
      expect(status.value.confirmationStatus).toBe('confirmed');
      expect(connection.getSignatureStatus).toHaveBeenCalledWith(
        'mock-signature',
        { searchTransactionHistory: true }
      );
    });
  });
  
  describe('getTransaction', () => {
    it('should get transaction details', async () => {
      const tx = await txBuilder.getTransaction('mock-signature');
      
      expect(tx.meta.logMessages).toEqual(['Program log: Success']);
      expect(connection.getTransaction).toHaveBeenCalledWith(
        'mock-signature',
        expect.objectContaining({ maxSupportedTransactionVersion: 0 })
      );
    });
  });
  
  describe('waitForConfirmation', () => {
    it('should wait for confirmation', async () => {
      const confirmed = await txBuilder.waitForConfirmation('mock-signature', 5000);
      
      expect(confirmed).toBe(true);
    });
    
    it('should timeout if not confirmed', async () => {
      connection.getSignatureStatus = vi.fn().mockResolvedValue({
        value: { confirmationStatus: 'processed', err: null },
      });
      
      const confirmed = await txBuilder.waitForConfirmation('mock-signature', 2000);
      
      expect(confirmed).toBe(false);
    });
    
    it('should throw on transaction error', async () => {
      connection.getSignatureStatus = vi.fn().mockResolvedValue({
        value: {
          confirmationStatus: 'confirmed',
          err: { InstructionError: [0, 'Error'] },
        },
      });
      
      await expect(
        txBuilder.waitForConfirmation('mock-signature', 5000)
      ).rejects.toThrow(TransactionError);
    });
  });
  
  describe('simulate', () => {
    it('should simulate a transaction', async () => {
      const tx = new Transaction();
      const result = await txBuilder.simulate(tx);
      
      expect(result.value.err).toBeNull();
      expect(connection.simulateTransaction).toHaveBeenCalled();
    });
    
    it('should throw TransactionError on simulation failure', async () => {
      connection.simulateTransaction = vi.fn().mockRejectedValue(new Error('Simulation failed'));
      
      const tx = new Transaction();
      
      await expect(txBuilder.simulate(tx)).rejects.toThrow(TransactionError);
    });
  });
  
  describe('getRecentPrioritizationFees', () => {
    it('should get recent prioritization fees', async () => {
      const fees = await txBuilder.getRecentPrioritizationFees();
      
      expect(fees).toEqual([]);
      expect(connection.getRecentPrioritizationFees).toHaveBeenCalled();
    });
    
    it('should get fees for specific addresses', async () => {
      const addresses = ['address1', 'address2'];
      await txBuilder.getRecentPrioritizationFees(addresses);
      
      expect(connection.getRecentPrioritizationFees).toHaveBeenCalledWith({
        lockedWritableAccounts: addresses,
      });
    });
  });
  
  describe('setRetryConfig', () => {
    it('should update retry configuration', () => {
      txBuilder.setRetryConfig({ maxRetries: 5 });
      
      const config = txBuilder.getRetryConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.initialDelayMs).toBe(1000); // unchanged
    });
  });
  
  describe('TransactionError', () => {
    it('should create error with all properties', () => {
      const error = new TransactionError(
        'Test error',
        'signature',
        ['log1', 'log2'],
        new Error('Original')
      );
      
      expect(error.message).toBe('Test error');
      expect(error.signature).toBe('signature');
      expect(error.logs).toEqual(['log1', 'log2']);
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.name).toBe('TransactionError');
    });
  });
});
