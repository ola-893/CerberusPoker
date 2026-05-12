/**
 * Event subscription manager for CerberusPoker
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import type { GameState, RevealedCard, BettingEvent, Unsubscribe } from './types';

/**
 * Manages event subscriptions for game state changes, card reveals, and betting actions
 * 
 * Uses Solana account subscriptions to monitor on-chain state changes and emit events.
 */
export class EventManager {
  private connection: Connection;
  private program: Program;
  private subscriptions: Map<number, () => void> = new Map();
  
  constructor(connection: Connection, program: Program) {
    this.connection = connection;
    this.program = program;
  }
  
  /**
   * Subscribe to game state changes
   * 
   * Monitors the GameSession account for state transitions.
   * 
   * @param gameId - Game ID to monitor
   * @param callback - Callback function called when state changes
   * @returns Unsubscribe function
   */
  onGameStateChange(gameId: bigint, callback: (state: GameState) => void): Unsubscribe {
    // Get GameSession PDA
    const gameIdBuffer = Buffer.alloc(8);
    gameIdBuffer.writeBigUInt64LE(gameId);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBuffer],
      this.program.programId
    );
    
    // Subscribe to account changes
    const subscriptionId = this.connection.onAccountChange(
      pda,
      (accountInfo) => {
        try {
          // Deserialize account data
          const gameSession = this.program.coder.accounts.decode(
            'gameSession',
            accountInfo.data
          );
          
          // Extract state and call callback
          const state = this.parseGameState(gameSession.state);
          callback(state);
        } catch (error) {
          console.error('Error parsing game state:', error);
        }
      },
      'confirmed'
    );
    
    // Store subscription for cleanup
    const unsubscribe = () => {
      this.connection.removeAccountChangeListener(subscriptionId);
      this.subscriptions.delete(subscriptionId);
    };
    
    this.subscriptions.set(subscriptionId, unsubscribe);
    return unsubscribe;
  }
  
  /**
   * Subscribe to card reveal events
   * 
   * Monitors the GameSession account for changes to unmasked_cards array.
   * 
   * @param gameId - Game ID to monitor
   * @param callback - Callback function called when a card is revealed
   * @returns Unsubscribe function
   */
  onCardRevealed(gameId: bigint, callback: (card: RevealedCard) => void): Unsubscribe {
    const gameIdBuffer = Buffer.alloc(8);
    gameIdBuffer.writeBigUInt64LE(gameId);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game'), gameIdBuffer],
      this.program.programId
    );
    
    let previousUnmaskedCards: number[] = [];
    
    const subscriptionId = this.connection.onAccountChange(
      pda,
      (accountInfo) => {
        try {
          const gameSession = this.program.coder.accounts.decode(
            'gameSession',
            accountInfo.data
          );
          
          const currentUnmaskedCards = gameSession.unmaskedCards;

          if (previousUnmaskedCards.length === 0) {
            previousUnmaskedCards = [...currentUnmaskedCards];
            return;
          }
          
          // Find newly revealed cards (compare with previous state)
          for (let i = 0; i < currentUnmaskedCards.length; i++) {
            const currentValue = currentUnmaskedCards[i];
            const previousValue = previousUnmaskedCards[i] || 0xFF;
            
            // 0xFF means not yet revealed
            if (previousValue === 0xFF && currentValue !== 0xFF) {
              callback({
                cardIndex: i,
                cardValue: currentValue,
                revealedAt: Date.now(),
              });
            }
          }
          
          previousUnmaskedCards = [...currentUnmaskedCards];
        } catch (error) {
          console.error('Error parsing card reveal:', error);
        }
      },
      'confirmed'
    );
    
    const unsubscribe = () => {
      this.connection.removeAccountChangeListener(subscriptionId);
      this.subscriptions.delete(subscriptionId);
    };
    
    this.subscriptions.set(subscriptionId, unsubscribe);
    return unsubscribe;
  }
  
  /**
   * Subscribe to betting action events
   * 
   * Monitors the PokerTable account for changes to current_player, folded_bitmap, etc.
   * 
   * @param gameId - Game ID to monitor
   * @param callback - Callback function called when a player acts
   * @returns Unsubscribe function
   */
  onBettingAction(gameId: bigint, callback: (event: BettingEvent) => void): Unsubscribe {
    const gameIdBuffer = Buffer.alloc(8);
    gameIdBuffer.writeBigUInt64LE(gameId);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('table'), gameIdBuffer],
      this.program.programId
    );
    
    let previousState: any = null;
    
    const subscriptionId = this.connection.onAccountChange(
      pda,
      (accountInfo) => {
        try {
          const pokerTable = this.program.coder.accounts.decode(
            'pokerTable',
            accountInfo.data
          );
          
          if (previousState) {
            // Detect changes and infer action
            // This is a simplified implementation — in reality, we'd parse transaction logs
            
            // Check for fold (folded_bitmap changed)
            if (pokerTable.foldedBitmap !== previousState.foldedBitmap) {
              const foldedPlayer = this.findChangedBit(
                previousState.foldedBitmap,
                pokerTable.foldedBitmap
              );
              if (foldedPlayer !== -1) {
                callback({
                  playerIndex: foldedPlayer,
                  action: 'Fold' as any,
                  timestamp: Date.now(),
                });
              }
            }
            
            // Check for all-in (all_in_bitmap changed)
            if (pokerTable.allInBitmap !== previousState.allInBitmap) {
              const allInPlayer = this.findChangedBit(
                previousState.allInBitmap,
                pokerTable.allInBitmap
              );
              if (allInPlayer !== -1) {
                callback({
                  playerIndex: allInPlayer,
                  action: 'AllIn' as any,
                  timestamp: Date.now(),
                });
              }
            }
            
            // Check for current_player change (someone acted)
            if (pokerTable.currentPlayer !== previousState.currentPlayer) {
              // Previous player acted
              callback({
                playerIndex: previousState.currentPlayer,
                action: 'Check' as any, // Simplified — would need to parse logs for actual action
                timestamp: Date.now(),
              });
            }
          }
          
          previousState = { ...pokerTable };
        } catch (error) {
          console.error('Error parsing betting action:', error);
        }
      },
      'confirmed'
    );
    
    const unsubscribe = () => {
      this.connection.removeAccountChangeListener(subscriptionId);
      this.subscriptions.delete(subscriptionId);
    };
    
    this.subscriptions.set(subscriptionId, unsubscribe);
    return unsubscribe;
  }
  
  /**
   * Close all active subscriptions
   */
  closeAll(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
  }
  
  /**
   * Parse GameState enum from on-chain representation
   */
  private parseGameState(state: any): GameState {
    if (state.lobby !== undefined) return 'Lobby' as GameState;
    if (state.shuffle !== undefined) return 'Shuffle' as GameState;
    if (state.deal !== undefined) return 'Deal' as GameState;
    if (state.active !== undefined) return 'Active' as GameState;
    if (state.showdown !== undefined) return 'Showdown' as GameState;
    if (state.complete !== undefined) return 'Complete' as GameState;
    return 'Lobby' as GameState;
  }
  
  /**
   * Find which bit changed in a bitmap
   * Returns the bit index, or -1 if no single bit changed
   */
  private findChangedBit(oldBitmap: number, newBitmap: number): number {
    const diff = oldBitmap ^ newBitmap;
    
    // Check if exactly one bit changed
    if (diff === 0 || (diff & (diff - 1)) !== 0) {
      return -1; // No change or multiple bits changed
    }
    
    // Find which bit
    for (let i = 0; i < 16; i++) {
      if ((diff & (1 << i)) !== 0) {
        return i;
      }
    }
    
    return -1;
  }
}
