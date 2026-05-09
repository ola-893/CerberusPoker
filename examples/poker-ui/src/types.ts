import { PublicKey } from '@solana/web3.js';

// ─── Game State Enums ────────────────────────────────────────────────────────

export enum GameState {
  Lobby = 'Lobby',
  Shuffle = 'Shuffle',
  Deal = 'Deal',
  Active = 'Active',
  Showdown = 'Showdown',
  Complete = 'Complete',
}

export enum PokerPhase {
  PreFlop = 'PreFlop',
  Flop = 'Flop',
  Turn = 'Turn',
  River = 'River',
  Showdown = 'Showdown',
  Complete = 'Complete',
}

export enum UIPhase {
  Connecting = 'connecting',
  Lobby = 'lobby',
  Shuffle = 'shuffle',
  Deal = 'deal',
  PreFlop = 'preflop',
  Flop = 'flop',
  Turn = 'turn',
  River = 'river',
  Showdown = 'showdown',
  Complete = 'complete',
  Aborted = 'aborted',
}

// ─── On-Chain Account Types ─────────────────────────────────────────────────

export interface GameSession {
  gameId: bigint;
  state: GameState;
  maxPlayers: number;
  deckSize: number;
  numPlayers: number;
  players: PublicKey[];
  activeComputationOffset: bigint;
  encryptedDeckHash: Uint8Array;
  shuffleBitmap: number;
  revealBitmap: bigint[];
  unmaskedCards: number[];
  cardAssignedTo: number[];
  cardValueUsed: bigint[];
  createdAt: bigint;
  shuffleDeadline: bigint;
  revealDeadline: bigint;
  pendingRevealCardIndex: number;
  pendingDealCardIndex: number;
  pendingDealPlayerIndex: number;
  bump: number;
}

export interface PokerTable {
  gameSession: PublicKey;
  phase: PokerPhase;
  dealerIndex: number;
  currentPlayer: number;
  potMint: PublicKey;
  potAccount: PublicKey;
  escrowAccount: PublicKey;
  playerStacks: PublicKey[];
  playerBets: PublicKey[];
  currentBet: bigint;
  foldedBitmap: number;
  allInBitmap: number;
  handVerifiedBitmap: number;
  smallBlind: bigint;
  bigBlind: bigint;
  handNumber: number;
  lastActionTime: bigint;
  numPlayers: number;
  actedBitmap: number;
  winnersBitmap: number;
  winnerCount: number;
  lastRaise: bigint;
  potTotal: bigint;
  playerRoundBets: bigint[];
  bump: number;
}

export interface DealtCard {
  gameId: bigint;
  cardIndex: number;
  playerIndex: number;
  cardValue: number;
  bump: number;
}

// ─── Card Types ──────────────────────────────────────────────────────────────

export interface Card {
  value: number; // 0-51
  rank: string;  // '2'-'A'
  suit: string;  // '♣','♦','♥','♠'
  color: 'red' | 'black';
}

// ─── Player Action Types ─────────────────────────────────────────────────────

export enum Action {
  Fold = 'Fold',
  Check = 'Check',
  Call = 'Call',
  Raise = 'Raise',
  AllIn = 'AllIn',
}

// ─── Hand Evaluation ─────────────────────────────────────────────────────────

export enum HandRank {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export interface HandEvaluation {
  rank: HandRank;
  tiebreaker: number[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const UNREVEALED = 0xff;
export const UNASSIGNED = 0xfe;
export const COMMUNITY_CARD = 0xff;

export const SHUFFLE_TIMEOUT_SECS = 300; // 5 minutes
export const REVEAL_TIMEOUT_SECS = 300;  // 5 minutes
export const BETTING_TIMEOUT_SECS = 120; // 2 minutes

export const MAX_PLAYERS = 6;
export const DECK_SIZE = 52;
