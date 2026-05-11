/**
 * Transaction Builders
 * 
 * Helper functions to build and send transactions for CerberusPoker instructions
 */

import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { 
  deriveGameSessionPDA, 
  derivePokerTablePDA,
  CERBERUS_POKER_PROGRAM_ID,
  TEXAS_HOLDEM_PROGRAM_ID 
} from './anchor';
import { DEMO_MAX_PLAYERS } from '../constants';

const DECK_SIZE = 52;

/**
 * Create a new game session
 */
export async function createGame(
  cerberusPokerProgram: Program,
  texasHoldemProgram: Program,
  gameId: bigint,
  maxPlayers: number,
  smallBlind: bigint,
  bigBlind: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  const demoMaxPlayers = Math.min(maxPlayers, DEMO_MAX_PLAYERS);
  
  // Step 1: Create game session (cerberus_poker)
  const createGameTx = await cerberusPokerProgram.methods
    .createGame(gameId, demoMaxPlayers, DECK_SIZE)
    .accounts({
      gameSession: gameSessionPDA,
      creator: cerberusPokerProgram.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  // Step 2: Create poker table (texas_holdem)
  const createTableTx = await texasHoldemProgram.methods
    .createTable(gameId, smallBlind, bigBlind)
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      creator: texasHoldemProgram.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  // Combine into single transaction
  const tx = new Transaction();
  tx.add(createGameTx);
  tx.add(createTableTx);

  // Send transaction
  const signature = await cerberusPokerProgram.provider.sendAndConfirm(tx);
  
  return { signature, gameId, gameSessionPDA, pokerTablePDA };
}

/**
 * Join an existing game
 */
export async function joinGame(
  cerberusPokerProgram: Program,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  
  const signature = await cerberusPokerProgram.methods
    .joinGame(gameId)
    .accounts({
      gameSession: gameSessionPDA,
      player: cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

/**
 * Start the shuffle phase
 */
export async function startShuffle(
  cerberusPokerProgram: Program,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  
  // Generate random computation offset
  const computationOffset = BigInt(Math.floor(Math.random() * 1000000));
  
  const signature = await cerberusPokerProgram.methods
    .startShuffle(gameId, computationOffset)
    .accounts({
      gameSession: gameSessionPDA,
      player: cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId, computationOffset };
}

/**
 * Deal cards to players
 */
export async function dealCards(
  cerberusPokerProgram: Program,
  gameId: bigint,
  numPlayers: number
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  
  // Create card assignments: 2 hole cards per player + 5 community cards
  const assignments: { cardIndex: number; playerIndex: number }[] = [];
  
  let cardIndex = 0;
  
  // Deal 2 hole cards to each player
  for (let player = 0; player < numPlayers; player++) {
    assignments.push({ cardIndex: cardIndex++, playerIndex: player });
    assignments.push({ cardIndex: cardIndex++, playerIndex: player });
  }
  
  // Deal 5 community cards (playerIndex = 0xFF for community)
  for (let i = 0; i < 5; i++) {
    assignments.push({ cardIndex: cardIndex++, playerIndex: 0xFF });
  }
  
  const computationOffset = BigInt(Math.floor(Math.random() * 1000000));
  
  const signature = await cerberusPokerProgram.methods
    .dealCards(gameId, assignments, computationOffset)
    .accounts({
      gameSession: gameSessionPDA,
      player: cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

/**
 * Player action (Fold/Check/Call/Raise/AllIn)
 */
export async function playerAction(
  texasHoldemProgram: Program,
  gameId: bigint,
  action: 'Fold' | 'Check' | 'Call' | 'Raise' | 'AllIn',
  amount: bigint = BigInt(0)
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  
  const computationOffset = BigInt(Math.floor(Math.random() * 1000000));
  
  // Convert action string to enum
  const actionEnum = { [action.toLowerCase()]: {} };
  
  const signature = await texasHoldemProgram.methods
    .playerAction(gameId, actionEnum, amount, computationOffset)
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      player: texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId, action };
}

/**
 * Advance to next phase (PreFlop → Flop → Turn → River → Showdown)
 */
export async function advancePhase(
  texasHoldemProgram: Program,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  
  const signature = await texasHoldemProgram.methods
    .advancePhase(gameId)
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      caller: texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

/**
 * Trigger showdown
 */
export async function triggerShowdown(
  texasHoldemProgram: Program,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  
  const signature = await texasHoldemProgram.methods
    .showdown(gameId)
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      caller: texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

/**
 * Timeout handlers
 */
export async function timeoutShuffle(
  cerberusPokerProgram: Program,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  
  const signature = await cerberusPokerProgram.methods
    .timeoutShuffle(gameId)
    .accounts({
      gameSession: gameSessionPDA,
      caller: cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function timeoutReveal(
  cerberusPokerProgram: Program,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  
  const signature = await cerberusPokerProgram.methods
    .timeoutReveal(gameId)
    .accounts({
      gameSession: gameSessionPDA,
      caller: cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function timeoutBet(
  texasHoldemProgram: Program,
  gameId: bigint
) {
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  
  const signature = await texasHoldemProgram.methods
    .timeoutBet(gameId)
    .accounts({
      pokerTable: pokerTablePDA,
      caller: texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}
