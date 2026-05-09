/**
 * Shared constants for the poker UI
 */

/** Deployed program IDs */
export const PROGRAM_IDS = {
  MXE: 'A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V',
  CERBERUS_POKER: '4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG',
  TEXAS_HOLDEM: 'h9xwoEpELRp4tUExQDpyjg2cfzvEUL53wy76sUZWok9',
} as const;

export const CLUSTER = 'devnet';
export const RPC_URL = 'https://api.devnet.solana.com';
export const CLUSTER_OFFSET = 456;

/** Card encoding helpers */
const RANK_SYMBOLS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const SUIT_NAMES = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];

export function decodeCard(value: number) {
  const suit = Math.floor(value / 13);
  const rank = value % 13;
  return {
    value,
    suit,
    rank,
    rankSymbol: RANK_SYMBOLS[rank],
    suitSymbol: SUIT_SYMBOLS[suit],
    suitName: SUIT_NAMES[suit],
    isRed: suit === 1 || suit === 2,
    name: `${RANK_SYMBOLS[rank]}${SUIT_SYMBOLS[suit]}`,
  };
}

/** Player seat positions around the table (6-max) */
export const SEAT_POSITIONS: Array<{ top: string; left: string }> = [
  { top: '100%', left: '50%' },   // Seat 0: bottom center (hero)
  { top: '80%', left: '5%' },     // Seat 1: bottom left
  { top: '20%', left: '5%' },     // Seat 2: top left
  { top: '-10%', left: '50%' },   // Seat 3: top center
  { top: '20%', left: '95%' },    // Seat 4: top right
  { top: '80%', left: '95%' },    // Seat 5: bottom right
];

/** Player emoji avatars */
export const PLAYER_AVATARS = ['🎮', '🃏', '🎲', '🎯', '🎰', '🎪'];
