/**
 * Tests for EventManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { EventManager } from '../events';
import { GameState, Action } from '../types';

// Mock program
const createMockProgram = () => {
  const programId = new PublicKey('CerberusPoker11111111111111111111111111111');
  
  return {
    programId,
    coder: {
      accounts: {
        decode: vi.fn(),
      },
    },
    account: {
      gameSession: {
        fetch: vi.fn(),
      },
      pokerTable: {
        fetch: vi.fn(),
      },
    },
  } as any;
};

// Mock connection
const createMockConnection = () => {
  return {
    onAccountChange: vi.fn((pubkey, callback, commitment) => {
      // Return a mock subscription ID
      return Math.floor(Math.random() * 1000000);
    }),
    removeAccountChangeListener: vi.fn(),
  } as any;
};

// Helper to create mock account info
const createMockAccountInfo = (data: Buffer): AccountInfo<Buffer> => {
  return {
    data,
    executable: false,
    lamports: 1000000,
    owner: new PublicKey('11111111111111111111111111111111'),
    rentEpoch: 0,
  };
};

describe('EventManager', () => {
  let connection: Connection;
  let program: Program;
  let eventManager: EventManager;
  
  beforeEach(() => {
    connection = createMockConnection();
    program = createMockProgram();
    eventManager = new EventManager(connection, program);
  });
  
  afterEach(() => {
    eventManager.closeAll();
  });
  
  describe('constructor', () => {
    it('should create instance with connection and program', () => {
      const manager = new EventManager(connection, program);
      expect(manager).toBeInstanceOf(EventManager);
    });
  });
  
  describe('onGameStateChange', () => {
    it('should subscribe to game state changes', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      const unsubscribe = eventManager.onGameStateChange(gameId, callback);
      
      expect(connection.onAccountChange).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
    
    it('should call callback when state changes to Shuffle', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      // Mock the decode to return a game session with Shuffle state
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        state: { shuffle: {} },
      });
      
      // Subscribe
      eventManager.onGameStateChange(gameId, callback);
      
      // Get the callback that was registered with onAccountChange
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      // Simulate account change
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).toHaveBeenCalledWith(GameState.Shuffle);
    });
    
    it('should call callback when state changes to Active', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        state: { active: {} },
      });
      
      eventManager.onGameStateChange(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).toHaveBeenCalledWith(GameState.Active);
    });
    
    it('should call callback when state changes to Showdown', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        state: { showdown: {} },
      });
      
      eventManager.onGameStateChange(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).toHaveBeenCalledWith(GameState.Showdown);
    });
    
    it('should call callback when state changes to Complete', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        state: { complete: {} },
      });
      
      eventManager.onGameStateChange(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).toHaveBeenCalledWith(GameState.Complete);
    });
    
    it('should default to Lobby state if unknown', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        state: { unknown: {} },
      });
      
      eventManager.onGameStateChange(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).toHaveBeenCalledWith(GameState.Lobby);
    });
    
    it('should handle decode errors gracefully', () => {
      const gameId = 123n;
      const callback = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      program.coder.accounts.decode = vi.fn().mockImplementation(() => {
        throw new Error('Decode failed');
      });
      
      eventManager.onGameStateChange(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Error parsing game state:', expect.any(Error));
      
      consoleError.mockRestore();
    });
    
    it('should unsubscribe correctly', () => {
      const gameId = 123n;
      const callback = vi.fn();
      const mockSubscriptionId = 12345;
      
      (connection.onAccountChange as any).mockReturnValue(mockSubscriptionId);
      
      const unsubscribe = eventManager.onGameStateChange(gameId, callback);
      unsubscribe();
      
      expect(connection.removeAccountChangeListener).toHaveBeenCalledWith(mockSubscriptionId);
    });
    
    it('should use correct PDA for game session', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      eventManager.onGameStateChange(gameId, callback);
      
      // Verify onAccountChange was called with a PublicKey
      const callArgs = (connection.onAccountChange as any).mock.calls[0];
      expect(callArgs[0]).toBeInstanceOf(PublicKey);
      expect(callArgs[2]).toBe('confirmed'); // commitment level
    });
  });
  
  describe('onCardRevealed', () => {
    it('should subscribe to card reveal events', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      const unsubscribe = eventManager.onCardRevealed(gameId, callback);
      
      expect(connection.onAccountChange).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
    
    it('should detect newly revealed cards', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      // First call: all cards unrevealed (0xFF)
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          unmaskedCards: Array(52).fill(0xFF),
        })
        .mockReturnValueOnce({
          unmaskedCards: [
            10, // Card 0 revealed as value 10
            0xFF, // Card 1 still hidden
            ...Array(50).fill(0xFF),
          ],
        });
      
      eventManager.onCardRevealed(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      // First update (initialize state)
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      // Second update (card revealed)
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        cardIndex: 0,
        cardValue: 10,
        revealedAt: expect.any(Number),
      });
    });
    
    it('should detect multiple cards revealed at once', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          unmaskedCards: Array(52).fill(0xFF),
        })
        .mockReturnValueOnce({
          unmaskedCards: [
            10, // Card 0 revealed
            20, // Card 1 revealed
            30, // Card 2 revealed
            ...Array(49).fill(0xFF),
          ],
        });
      
      eventManager.onCardRevealed(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, {
        cardIndex: 0,
        cardValue: 10,
        revealedAt: expect.any(Number),
      });
      expect(callback).toHaveBeenNthCalledWith(2, {
        cardIndex: 1,
        cardValue: 20,
        revealedAt: expect.any(Number),
      });
      expect(callback).toHaveBeenNthCalledWith(3, {
        cardIndex: 2,
        cardValue: 30,
        revealedAt: expect.any(Number),
      });
    });
    
    it('should not trigger callback for already revealed cards', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          unmaskedCards: [10, 0xFF, ...Array(50).fill(0xFF)],
        })
        .mockReturnValueOnce({
          unmaskedCards: [10, 0xFF, ...Array(50).fill(0xFF)], // Same state
        });
      
      eventManager.onCardRevealed(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      expect(callback).not.toHaveBeenCalled();
    });
    
    it('should handle decode errors gracefully', () => {
      const gameId = 123n;
      const callback = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      program.coder.accounts.decode = vi.fn().mockImplementation(() => {
        throw new Error('Decode failed');
      });
      
      eventManager.onCardRevealed(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Error parsing card reveal:', expect.any(Error));
      
      consoleError.mockRestore();
    });
    
    it('should unsubscribe correctly', () => {
      const gameId = 123n;
      const callback = vi.fn();
      const mockSubscriptionId = 54321;
      
      (connection.onAccountChange as any).mockReturnValue(mockSubscriptionId);
      
      const unsubscribe = eventManager.onCardRevealed(gameId, callback);
      unsubscribe();
      
      expect(connection.removeAccountChangeListener).toHaveBeenCalledWith(mockSubscriptionId);
    });
  });
  
  describe('onBettingAction', () => {
    it('should subscribe to betting action events', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      const unsubscribe = eventManager.onBettingAction(gameId, callback);
      
      expect(connection.onAccountChange).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
    
    it('should detect fold action', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          foldedBitmap: 0b0000, // No one folded
          allInBitmap: 0b0000,
          currentPlayer: 0,
        })
        .mockReturnValueOnce({
          foldedBitmap: 0b0001, // Player 0 folded
          allInBitmap: 0b0000,
          currentPlayer: 0,
        });
      
      eventManager.onBettingAction(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      expect(callback).toHaveBeenCalledWith({
        playerIndex: 0,
        action: Action.Fold,
        timestamp: expect.any(Number),
      });
    });
    
    it('should detect all-in action', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          foldedBitmap: 0b0000,
          allInBitmap: 0b0000, // No one all-in
          currentPlayer: 0,
        })
        .mockReturnValueOnce({
          foldedBitmap: 0b0000,
          allInBitmap: 0b0100, // Player 2 went all-in
          currentPlayer: 0,
        });
      
      eventManager.onBettingAction(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      expect(callback).toHaveBeenCalledWith({
        playerIndex: 2,
        action: Action.AllIn,
        timestamp: expect.any(Number),
      });
    });
    
    it('should detect current player change', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          foldedBitmap: 0b0000,
          allInBitmap: 0b0000,
          currentPlayer: 1,
        })
        .mockReturnValueOnce({
          foldedBitmap: 0b0000,
          allInBitmap: 0b0000,
          currentPlayer: 2, // Turn advanced
        });
      
      eventManager.onBettingAction(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      expect(callback).toHaveBeenCalledWith({
        playerIndex: 1, // Previous player acted
        action: Action.Check, // Simplified action
        timestamp: expect.any(Number),
      });
    });
    
    it('should not trigger on first update (no previous state)', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        foldedBitmap: 0b0000,
        allInBitmap: 0b0000,
        currentPlayer: 0,
      });
      
      eventManager.onBettingAction(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).not.toHaveBeenCalled();
    });
    
    it('should handle multiple simultaneous changes', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      program.coder.accounts.decode = vi.fn()
        .mockReturnValueOnce({
          foldedBitmap: 0b0000,
          allInBitmap: 0b0000,
          currentPlayer: 0,
        })
        .mockReturnValueOnce({
          foldedBitmap: 0b0001, // Player 0 folded
          allInBitmap: 0b0010, // Player 1 went all-in
          currentPlayer: 2, // Turn advanced to player 2
        });
      
      eventManager.onBettingAction(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      
      const mockAccountInfo1 = createMockAccountInfo(Buffer.from('mock-data-1'));
      accountChangeCallback(mockAccountInfo1);
      
      const mockAccountInfo2 = createMockAccountInfo(Buffer.from('mock-data-2'));
      accountChangeCallback(mockAccountInfo2);
      
      // Should detect all three changes
      expect(callback).toHaveBeenCalledTimes(3);
    });
    
    it('should handle decode errors gracefully', () => {
      const gameId = 123n;
      const callback = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      program.coder.accounts.decode = vi.fn().mockImplementation(() => {
        throw new Error('Decode failed');
      });
      
      eventManager.onBettingAction(gameId, callback);
      const accountChangeCallback = (connection.onAccountChange as any).mock.calls[0][1];
      const mockAccountInfo = createMockAccountInfo(Buffer.from('mock-data'));
      accountChangeCallback(mockAccountInfo);
      
      expect(callback).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Error parsing betting action:', expect.any(Error));
      
      consoleError.mockRestore();
    });
    
    it('should unsubscribe correctly', () => {
      const gameId = 123n;
      const callback = vi.fn();
      const mockSubscriptionId = 99999;
      
      (connection.onAccountChange as any).mockReturnValue(mockSubscriptionId);
      
      const unsubscribe = eventManager.onBettingAction(gameId, callback);
      unsubscribe();
      
      expect(connection.removeAccountChangeListener).toHaveBeenCalledWith(mockSubscriptionId);
    });
    
    it('should use correct PDA for poker table', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      eventManager.onBettingAction(gameId, callback);
      
      // Verify onAccountChange was called with a PublicKey
      const callArgs = (connection.onAccountChange as any).mock.calls[0];
      expect(callArgs[0]).toBeInstanceOf(PublicKey);
      expect(callArgs[2]).toBe('confirmed'); // commitment level
    });
  });
  
  describe('closeAll', () => {
    it('should close all active subscriptions', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      const mockSubId1 = 111;
      const mockSubId2 = 222;
      const mockSubId3 = 333;
      
      (connection.onAccountChange as any)
        .mockReturnValueOnce(mockSubId1)
        .mockReturnValueOnce(mockSubId2)
        .mockReturnValueOnce(mockSubId3);
      
      // Create multiple subscriptions
      eventManager.onGameStateChange(gameId, callback);
      eventManager.onCardRevealed(gameId, callback);
      eventManager.onBettingAction(gameId, callback);
      
      // Close all
      eventManager.closeAll();
      
      expect(connection.removeAccountChangeListener).toHaveBeenCalledWith(mockSubId1);
      expect(connection.removeAccountChangeListener).toHaveBeenCalledWith(mockSubId2);
      expect(connection.removeAccountChangeListener).toHaveBeenCalledWith(mockSubId3);
    });
    
    it('should handle empty subscriptions', () => {
      eventManager.closeAll();
      
      expect(connection.removeAccountChangeListener).not.toHaveBeenCalled();
    });
    
    it('should clear subscriptions map after closing', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      eventManager.onGameStateChange(gameId, callback);
      eventManager.closeAll();
      
      // Calling closeAll again should not throw
      expect(() => eventManager.closeAll()).not.toThrow();
    });
  });
  
  describe('integration scenarios', () => {
    it('should handle full game flow events', () => {
      const gameId = 123n;
      const stateCallback = vi.fn();
      const cardCallback = vi.fn();
      const bettingCallback = vi.fn();
      
      // Subscribe to all events
      eventManager.onGameStateChange(gameId, stateCallback);
      eventManager.onCardRevealed(gameId, cardCallback);
      eventManager.onBettingAction(gameId, bettingCallback);
      
      expect(connection.onAccountChange).toHaveBeenCalledTimes(3);
    });
    
    it('should allow multiple callbacks for same event', () => {
      const gameId = 123n;
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      program.coder.accounts.decode = vi.fn().mockReturnValue({
        state: { active: {} },
      });
      
      eventManager.onGameStateChange(gameId, callback1);
      eventManager.onGameStateChange(gameId, callback2);
      
      // Both should be subscribed
      expect(connection.onAccountChange).toHaveBeenCalledTimes(2);
    });
    
    it('should handle reconnection scenarios', () => {
      const gameId = 123n;
      const callback = vi.fn();
      
      // First subscription
      const unsubscribe1 = eventManager.onGameStateChange(gameId, callback);
      unsubscribe1();
      
      // Resubscribe
      const unsubscribe2 = eventManager.onGameStateChange(gameId, callback);
      
      expect(connection.onAccountChange).toHaveBeenCalledTimes(2);
      expect(typeof unsubscribe2).toBe('function');
    });
  });
});
