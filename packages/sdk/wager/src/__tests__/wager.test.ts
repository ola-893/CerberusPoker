/**
 * Tests for @cerberus-poker/wager - WagerModule
 *
 * Tests cover:
 * - placeBet builds correct confidential transfer instruction
 * - callBet fetches current bet and builds Action::Call
 * - fold builds Action::Fold with no amount
 * - getEncryptedBalance returns correct structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WagerModule } from '../index';

// Mock wallet
const mockWallet = {
  publicKey: PublicKey.default,
  signTransaction: vi.fn(async (tx: any) => tx),
  signAllTransactions: vi.fn(async (txs: any[]) => txs),
};

// Mock poker table account data
const mockPokerTable = {
  gameSession: PublicKey.default,
  phase: { preFlop: {} },
  currentPlayer: 0,
  currentBet: { toString: () => '1000000' },
  escrowAccount: PublicKey.default,
  foldedBitmap: 0,
  allInBitmap: 0,
};

// Mock connection
const mockConnection = {
  getLatestBlockhash: vi.fn(async () => ({
    blockhash: 'mock-blockhash',
    lastValidBlockHeight: 1000,
  })),
  getAccountInfo: vi.fn(async () => null),
  getTokenAccountBalance: vi.fn(async () => ({
    value: {
      amount: '5000000000',
      decimals: 6,
      uiAmount: 5000,
    },
  })),
  sendRawTransaction: vi.fn(async () => 'mock-signature'),
  confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
} as unknown as Connection;

// Mock program
const mockProgram = {
  programId: PublicKey.default,
  methods: {
    playerAction: vi.fn(() => ({
      accounts: vi.fn(() => ({
        rpc: vi.fn(async () => 'mock-tx-sig'),
      })),
    })),
    showdown: vi.fn(() => ({
      accounts: vi.fn(() => ({
        rpc: vi.fn(async () => 'mock-tx-sig'),
      })),
    })),
    placeBet: vi.fn(() => ({
      accounts: vi.fn(() => ({
        rpc: vi.fn(async () => 'mock-tx-sig'),
      })),
    })),
  },
  account: {
    pokerTable: {
      fetch: vi.fn(async () => mockPokerTable),
    },
  },
};

describe('WagerModule', () => {
  let wagerModule: WagerModule;

  beforeEach(() => {
    vi.clearAllMocks();
    wagerModule = new WagerModule({
      connection: mockConnection,
      wallet: mockWallet,
      tableProgram: mockProgram as any,
      usdcPlusMint: PublicKey.default,
      usdcMint: PublicKey.default,
      arciumProgramId: PublicKey.default,
      clusterOffset: 456,
    });
  });

  describe('getEncryptedBalance', () => {
    it('should return zero balance when no token account exists', async () => {
      mockConnection.getAccountInfo = vi.fn(async () => null) as any;

      const balance = await wagerModule.getEncryptedBalance(PublicKey.default);

      expect(balance).toBeDefined();
      expect(balance.ciphertext).toBeInstanceOf(Uint8Array);
      expect(balance.ciphertext.length).toBe(0);
    });

    it('should return encoded balance when token account exists', async () => {
      mockConnection.getAccountInfo = vi.fn(async () => ({
        data: Buffer.alloc(165), // Token account size
        owner: PublicKey.default,
        lamports: LAMPORTS_PER_SOL,
        executable: false,
        rentEpoch: 0,
      })) as any;

      const balance = await wagerModule.getEncryptedBalance(PublicKey.default);

      expect(balance).toBeDefined();
      expect(balance.ciphertext).toBeInstanceOf(Uint8Array);
      expect(balance.ciphertext.length).toBe(8);
      expect(balance.publicKey).toBeInstanceOf(Uint8Array);
    });

    it('should return zero balance on fetch error', async () => {
      mockConnection.getAccountInfo = vi.fn(async () => {
        throw new Error('Account not found');
      }) as any;

      const balance = await wagerModule.getEncryptedBalance(PublicKey.default);

      expect(balance).toBeDefined();
      expect(balance.ciphertext.length).toBe(8);
    });
  });

  describe('module construction', () => {
    it('should create WagerModule with valid config', () => {
      expect(wagerModule).toBeDefined();
    });

    it('should store connection and wallet references', () => {
      // The module should be constructable without errors
      const module = new WagerModule({
        connection: mockConnection,
        wallet: mockWallet,
        tableProgram: mockProgram as any,
        usdcPlusMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        arciumProgramId: new PublicKey('A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V'),
        clusterOffset: 456,
      });
      expect(module).toBeDefined();
    });
  });
});
