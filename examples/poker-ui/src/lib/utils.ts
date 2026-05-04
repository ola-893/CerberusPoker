import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Card, UNREVEALED, UNASSIGNED } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string): string {
  if (address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Convert card value (0-51) to display format
 * Backend encoding: suit = card / 13, rank = card % 13
 */
export function cardToDisplay(value: number): Card {
  if (value === UNREVEALED || value === UNASSIGNED) {
    return {
      value,
      rank: '',
      suit: '',
      color: 'black',
    };
  }

  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits = ['♣', '♦', '♥', '♠'];
  
  const rank = ranks[value % 13];
  const suitIndex = Math.floor(value / 13);
  const suit = suits[suitIndex];
  const color = suitIndex === 1 || suitIndex === 2 ? 'red' : 'black';

  return { value, rank, suit, color };
}

/**
 * Format SOL amount with proper decimals
 */
export function formatSOL(lamports: bigint | number): string {
  const amount = typeof lamports === 'bigint' ? Number(lamports) : lamports;
  return (amount / 1e9).toFixed(2);
}

/**
 * Format USDC+ amount
 */
export function formatUSDC(amount: bigint | number): string {
  const amt = typeof amount === 'bigint' ? Number(amount) : amount;
  return (amt / 1e6).toFixed(2);
}

/**
 * Check if a player has shuffled (bit set in shuffle_bitmap)
 */
export function hasPlayerShuffled(shuffleBitmap: number, playerIndex: number): boolean {
  return ((shuffleBitmap >> playerIndex) & 1) === 1;
}

/**
 * Check if a player has folded
 */
export function hasPlayerFolded(foldedBitmap: number, playerIndex: number): boolean {
  return ((foldedBitmap >> playerIndex) & 1) === 1;
}

/**
 * Check if a player is all-in
 */
export function isPlayerAllIn(allInBitmap: number, playerIndex: number): boolean {
  return ((allInBitmap >> playerIndex) & 1) === 1;
}

/**
 * Check if a card has been revealed
 */
export function isCardRevealed(revealBitmap: bigint[], cardIndex: number): boolean {
  if (cardIndex >= 52) return false;
  return ((revealBitmap[0] >> BigInt(cardIndex)) & 1n) === 1n;
}
