/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UNREVEALED, UNASSIGNED } from '../types';

/**
 * Convert card value (0-51) to display format
 * Card encoding: suit = card / 13, rank = card % 13
 * Suits: 0=♣, 1=♦, 2=♥, 3=♠
 * Ranks: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 */
export const cardToDisplay = (value: number) => {
  if (value === UNREVEALED) return { back: true };
  if (value === UNASSIGNED) return { empty: true };

  const suit = Math.floor(value / 13);
  const rank = value % 13;

  const suits = ['♣', '♦', '♥', '♠'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const rankNames = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const suitNames = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];

  return {
    symbol: suits[suit],
    rank: ranks[rank],
    isRed: suit === 1 || suit === 2, // Diamonds or Hearts
    label: `${rankNames[rank]} of ${suitNames[suit]}`,
  };
};
