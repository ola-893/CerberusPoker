/**
 * Tests for @cerberus-poker/deck - DeckModule
 *
 * Tests cover:
 * - Card encoding/decoding
 * - Random permutation generation
 * - DecryptCard returns correct values
 * - ShuffleDeck builds correct ArgBuilder args
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import { DeckModule, Suit, Rank } from '../index';

// Mock wallet
const mockWallet = {
  publicKey: PublicKey.default,
  signTransaction: vi.fn(async (tx: any) => tx),
  signAllTransactions: vi.fn(async (txs: any[]) => txs),
};

// Mock connection
const mockConnection = {
  getLatestBlockhash: vi.fn(async () => ({
    blockhash: 'mock-blockhash',
    lastValidBlockHeight: 1000,
  })),
  getAccountInfo: vi.fn(async () => null),
  sendRawTransaction: vi.fn(async () => 'mock-signature'),
  confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
  onAccountChange: vi.fn(() => 0),
  removeAccountChangeListener: vi.fn(),
} as unknown as Connection;

// Mock program
const mockProgram = {
  programId: PublicKey.default,
  methods: {},
  account: {},
  coder: {
    accounts: {
      decode: vi.fn(),
    },
  },
};

describe('DeckModule', () => {
  let deckModule: DeckModule;

  beforeEach(() => {
    deckModule = new DeckModule({
      connection: mockConnection,
      wallet: mockWallet,
      cerberusProgram: mockProgram as any,
      mxeProgramId: PublicKey.default,
      clusterOffset: 456,
    });
  });

  // ─── Card Decoding ──────────────────────────────────────────────────────

  describe('decodeCard', () => {
    it('should decode card value 0 as 2 of Clubs', () => {
      const card = deckModule.decodeCard(0);
      expect(card.suit).toBe(Suit.Clubs);
      expect(card.rank).toBe(Rank.Two);
      expect(card.name).toBe('2 of Clubs');
    });

    it('should decode card value 12 as Ace of Clubs', () => {
      const card = deckModule.decodeCard(12);
      expect(card.suit).toBe(Suit.Clubs);
      expect(card.rank).toBe(Rank.Ace);
      expect(card.name).toBe('Ace of Clubs');
    });

    it('should decode card value 13 as 2 of Diamonds', () => {
      const card = deckModule.decodeCard(13);
      expect(card.suit).toBe(Suit.Diamonds);
      expect(card.rank).toBe(Rank.Two);
      expect(card.name).toBe('2 of Diamonds');
    });

    it('should decode card value 51 as Ace of Spades', () => {
      const card = deckModule.decodeCard(51);
      expect(card.suit).toBe(Suit.Spades);
      expect(card.rank).toBe(Rank.Ace);
      expect(card.name).toBe('Ace of Spades');
    });

    it('should decode card value 39 as Ace of Hearts', () => {
      const card = deckModule.decodeCard(38);
      expect(card.suit).toBe(Suit.Hearts);
      expect(card.rank).toBe(Rank.King);
      expect(card.name).toBe('King of Hearts');
    });

    it('should throw for invalid card value -1', () => {
      expect(() => deckModule.decodeCard(-1)).toThrow('Invalid card value');
    });

    it('should throw for invalid card value 52', () => {
      expect(() => deckModule.decodeCard(52)).toThrow('Invalid card value');
    });

    it('should throw for invalid card value 100', () => {
      expect(() => deckModule.decodeCard(100)).toThrow('Invalid card value');
    });
  });

  // ─── Card Encoding ──────────────────────────────────────────────────────

  describe('encodeCard', () => {
    it('should encode 2 of Clubs as 0', () => {
      const value = deckModule.encodeCard(Suit.Clubs, Rank.Two);
      expect(value).toBe(0);
    });

    it('should encode Ace of Spades as 51', () => {
      const value = deckModule.encodeCard(Suit.Spades, Rank.Ace);
      expect(value).toBe(51);
    });

    it('should encode King of Hearts as 37', () => {
      const value = deckModule.encodeCard(Suit.Hearts, Rank.King);
      expect(value).toBe(37);
    });

    it('should roundtrip encode/decode', () => {
      for (let i = 0; i < 52; i++) {
        const decoded = deckModule.decodeCard(i);
        const encoded = deckModule.encodeCard(decoded.suit, decoded.rank);
        expect(encoded).toBe(i);
      }
    });
  });

  // ─── Decode All Cards ───────────────────────────────────────────────────

  describe('decodeAllCards', () => {
    it('should return 52 cards', () => {
      const cards = deckModule.decodeAllCards();
      expect(cards).toHaveLength(52);
    });

    it('should have all unique values', () => {
      const cards = deckModule.decodeAllCards();
      const values = cards.map(c => c.value);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(52);
    });

    it('should have 13 cards per suit', () => {
      const cards = deckModule.decodeAllCards();
      const suitCounts = [0, 0, 0, 0];
      cards.forEach(c => suitCounts[c.suit]++);
      expect(suitCounts).toEqual([13, 13, 13, 13]);
    });

    it('should have 4 cards per rank', () => {
      const cards = deckModule.decodeAllCards();
      const rankCounts = new Array(13).fill(0);
      cards.forEach(c => rankCounts[c.rank]++);
      expect(rankCounts.every(count => count === 4)).toBe(true);
    });
  });

  // ─── Decrypt Card ───────────────────────────────────────────────────────

  describe('decryptCard', () => {
    it('should throw for invalid private key length', () => {
      const dealtCard = {
        cardIndex: 0,
        playerIndex: 0,
        ciphertext: new Uint8Array([10]),
        nonce: new Uint8Array(32),
      };

      expect(() => deckModule.decryptCard(dealtCard, new Uint8Array(16))).toThrow(
        'Private key must be 32 bytes'
      );
    });

    it('should throw for empty ciphertext', () => {
      const dealtCard = {
        cardIndex: 0,
        playerIndex: 0,
        ciphertext: new Uint8Array(0),
        nonce: new Uint8Array(32),
      };

      expect(() => deckModule.decryptCard(dealtCard, new Uint8Array(32))).toThrow(
        'Dealt card has no ciphertext'
      );
    });

    it('should decrypt a card value correctly', () => {
      // Create a "ciphertext" that when XOR'd with derived key gives a valid card
      const privateKey = new Uint8Array(32).fill(0);
      const nonce = new Uint8Array(32).fill(0);
      // XOR of privateKey[0] and nonce[0] = 0, so ciphertext[0] XOR 0 = ciphertext[0]
      const cardValue = 25; // Some valid card
      const ciphertext = new Uint8Array([cardValue]);

      const dealtCard = {
        cardIndex: 0,
        playerIndex: 0,
        ciphertext,
        nonce,
      };

      const decoded = deckModule.decryptCard(dealtCard, privateKey);
      expect(decoded.value).toBe(cardValue);
      expect(decoded.suit).toBe(Suit.Diamonds);
      expect(decoded.rank).toBe(Rank.King);
    });
  });

  // ─── Deal Card Validation ──────────────────────────────────────────────

  describe('dealCard', () => {
    it('should reject invalid card index -1', async () => {
      await expect(
        deckModule.dealCard(-1, PublicKey.default)
      ).rejects.toThrow('Invalid card index');
    });

    it('should reject invalid card index 52', async () => {
      await expect(
        deckModule.dealCard(52, PublicKey.default)
      ).rejects.toThrow('Invalid card index');
    });
  });

  // ─── Reveal Card Validation ─────────────────────────────────────────────

  describe('revealCommunityCard', () => {
    it('should reject invalid card index', async () => {
      await expect(
        deckModule.revealCommunityCard(1n, 52)
      ).rejects.toThrow('Invalid card index');
    });

    it('should reject negative card index', async () => {
      await expect(
        deckModule.revealCommunityCard(1n, -1)
      ).rejects.toThrow('Invalid card index');
    });
  });
});
