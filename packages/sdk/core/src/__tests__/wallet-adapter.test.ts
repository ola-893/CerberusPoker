/**
 * Unit tests for wallet adapter integration
 * 
 * These tests verify the wallet adapter wrapper and manager functionality.
 * Run with: npm test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicKey, Transaction } from '@solana/web3.js';
import type { WalletAdapter } from '@solana/wallet-adapter-base';
import {
  WalletAdapterWrapper,
  WalletManager,
  WalletConnectionState,
  detectAvailableWallets,
  createAnchorWallet,
} from '../wallet-adapter';

// Mock wallet adapter for testing
class MockWalletAdapter implements Partial<WalletAdapter> {
  publicKey: PublicKey | null = null;
  connected = false;
  connecting = false;
  disconnecting = false;
  
  private listeners: Map<string, Set<Function>> = new Map();
  
  async connect(): Promise<void> {
    this.connecting = true;
    await new Promise(resolve => setTimeout(resolve, 10));
    this.publicKey = new PublicKey('11111111111111111111111111111111');
    this.connected = true;
    this.connecting = false;
    this.emit('connect');
  }
  
  async disconnect(): Promise<void> {
    this.disconnecting = true;
    await new Promise(resolve => setTimeout(resolve, 10));
    this.publicKey = null;
    this.connected = false;
    this.disconnecting = false;
    this.emit('disconnect');
  }
  
  async signTransaction<T extends Transaction>(tx: T): Promise<T> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    return tx;
  }
  
  async signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    return txs;
  }
  
  on(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }
  
  off(event: string, handler: Function): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  
  private emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }
}

describe('WalletAdapterWrapper', () => {
  it('should wrap a connected wallet adapter', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();
    
    const wrapper = new WalletAdapterWrapper(adapter as any);
    
    expect(wrapper.publicKey).toBeDefined();
    expect(wrapper.publicKey.toBase58()).toBe('11111111111111111111111111111111');
  });
  
  it('should throw if adapter is not connected', () => {
    const adapter = new MockWalletAdapter();
    
    expect(() => new WalletAdapterWrapper(adapter as any)).toThrow(
      'Wallet adapter must be connected before wrapping'
    );
  });
  
  it('should sign transactions', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();
    
    const wrapper = new WalletAdapterWrapper(adapter as any);
    const tx = new Transaction();
    
    const signed = await wrapper.signTransaction(tx);
    expect(signed).toBe(tx);
  });
  
  it('should sign multiple transactions', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();
    
    const wrapper = new WalletAdapterWrapper(adapter as any);
    const txs = [new Transaction(), new Transaction()];
    
    const signed = await wrapper.signAllTransactions(txs);
    expect(signed).toEqual(txs);
  });
});

describe('WalletManager', () => {
  let manager: WalletManager;
  
  beforeEach(() => {
    manager = new WalletManager();
  });
  
  it('should start in disconnected state', () => {
    expect(manager.getState()).toBe(WalletConnectionState.Disconnected);
    expect(manager.isConnected()).toBe(false);
    expect(manager.getWallet()).toBeNull();
  });
  
  it('should connect to a wallet', async () => {
    const adapter = new MockWalletAdapter();
    
    const wallet = await manager.connect(adapter as any);
    
    expect(manager.getState()).toBe(WalletConnectionState.Connected);
    expect(manager.isConnected()).toBe(true);
    expect(wallet).toBeDefined();
    expect(wallet.publicKey).toBeDefined();
  });
  
  it('should emit state change events', async () => {
    const adapter = new MockWalletAdapter();
    const states: WalletConnectionState[] = [];
    
    manager.onStateChange(state => states.push(state));
    
    await manager.connect(adapter as any);
    
    expect(states).toContain(WalletConnectionState.Connecting);
    expect(states).toContain(WalletConnectionState.Connected);
  });
  
  it('should disconnect from a wallet', async () => {
    const adapter = new MockWalletAdapter();
    await manager.connect(adapter as any);
    
    await manager.disconnect();
    
    expect(manager.getState()).toBe(WalletConnectionState.Disconnected);
    expect(manager.isConnected()).toBe(false);
    expect(manager.getWallet()).toBeNull();
  });
  
  it('should handle connection errors', async () => {
    const adapter = new MockWalletAdapter();
    adapter.connect = async () => {
      throw new Error('Connection failed');
    };
    
    const errors: Error[] = [];
    manager.onError(error => errors.push(error));
    
    await expect(manager.connect(adapter as any)).rejects.toThrow('Connection failed');
    
    expect(manager.getState()).toBe(WalletConnectionState.Disconnected);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Connection failed');
  });
  
  it('should prevent connecting while already connecting', async () => {
    const adapter = new MockWalletAdapter();
    
    // Start connection (don't await)
    const promise1 = manager.connect(adapter as any);
    
    // Try to connect again immediately
    await expect(manager.connect(adapter as any)).rejects.toThrow(
      'Already connecting to a wallet'
    );
    
    // Wait for first connection to complete
    await promise1;
  });
  
  it('should prevent connecting to different wallet while connected', async () => {
    const adapter1 = new MockWalletAdapter();
    const adapter2 = new MockWalletAdapter();
    
    await manager.connect(adapter1 as any);
    
    await expect(manager.connect(adapter2 as any)).rejects.toThrow(
      'Already connected to a different wallet'
    );
  });
  
  it('should allow reconnecting to same wallet', async () => {
    const adapter = new MockWalletAdapter();
    
    await manager.connect(adapter as any);
    const wallet = await manager.connect(adapter as any);
    
    expect(wallet).toBeDefined();
    expect(manager.isConnected()).toBe(true);
  });
  
  it('should unsubscribe from state changes', async () => {
    const adapter = new MockWalletAdapter();
    const states: WalletConnectionState[] = [];
    
    const unsubscribe = manager.onStateChange(state => states.push(state));
    
    await manager.connect(adapter as any);
    const statesAfterConnect = states.length;
    
    unsubscribe();
    
    await manager.disconnect();
    
    // No new states should be added after unsubscribe
    expect(states.length).toBe(statesAfterConnect);
  });
});

describe('detectAvailableWallets', () => {
  it('should detect no wallets in Node.js environment', () => {
    const available = detectAvailableWallets();
    
    expect(available.phantom).toBe(false);
    expect(available.backpack).toBe(false);
  });
  
  it('should detect Phantom if window.solana.isPhantom is true', () => {
    // Mock browser environment
    (global as any).window = {
      solana: { isPhantom: true },
    };
    
    const available = detectAvailableWallets();
    
    expect(available.phantom).toBe(true);
    
    // Cleanup
    delete (global as any).window;
  });
  
  it('should detect Backpack if window.backpack.isBackpack is true', () => {
    // Mock browser environment
    (global as any).window = {
      backpack: { isBackpack: true },
    };
    
    const available = detectAvailableWallets();
    
    expect(available.backpack).toBe(true);
    
    // Cleanup
    delete (global as any).window;
  });
});

describe('createAnchorWallet', () => {
  it('should create an AnchorWallet from a connected adapter', async () => {
    const adapter = new MockWalletAdapter();
    await adapter.connect();
    
    const wallet = createAnchorWallet(adapter as any);
    
    expect(wallet.publicKey).toBeDefined();
    expect(wallet.signTransaction).toBeDefined();
    expect(wallet.signAllTransactions).toBeDefined();
  });
  
  it('should throw if adapter is not connected', () => {
    const adapter = new MockWalletAdapter();
    
    expect(() => createAnchorWallet(adapter as any)).toThrow(
      'Wallet adapter must be connected before wrapping'
    );
  });
});
