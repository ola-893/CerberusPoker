/**
 * Transaction Builders
 *
 * Anchor's Borsh encoder requires BN (bn.js) for u64 fields — NOT JavaScript bigint.
 * All bigint values are converted via bn() before being passed to .methods().
 */

import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import {
  deriveGameSessionPDA,
  derivePokerTablePDA,
  TEXAS_HOLDEM_PROGRAM_ID,
  type AnchorProgramClient,
} from './anchor';

// Devnet USDC mint (Circle's official devnet USDC)
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

/** Derive the escrow PDA for a game — holds USDC+ during the hand */
function deriveEscrowPDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), gameIdBuffer],
    TEXAS_HOLDEM_PROGRAM_ID
  );
}

/** Derive the pot account PDA for a game */
function derivePotAccountPDA(gameId: bigint): [PublicKey, number] {
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pot'), gameIdBuffer],
    TEXAS_HOLDEM_PROGRAM_ID
  );
}

/** Convert JS bigint → BN for Anchor method calls */
const bn = (val: bigint | number): BN => new BN(val.toString());

/** Random u64 computation offset for MXE */
const randomOffset = (): BN => new BN(Math.floor(Math.random() * 1_000_000).toString());

// ─── Game Management ──────────────────────────────────────────────────────────

export async function createGame(
  cerberusPokerProgram: AnchorProgramClient,
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint,
  maxPlayers: number,
  smallBlind: bigint,
  bigBlind: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA]  = derivePokerTablePDA(gameId);
  const [escrowPDA]      = deriveEscrowPDA(gameId);
  const [potAccountPDA]  = derivePotAccountPDA(gameId);

  // Step 1: create_game (cerberus_poker)
  const createGameTx = await cerberusPokerProgram.methods
    .createGame(bn(gameId), maxPlayers, 52)
    .accounts({
      gameSession:   gameSessionPDA,
      creator:       cerberusPokerProgram.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  // Step 2: create_table (texas_holdem)
  // pot_mint, pot_account, escrow_account are UncheckedAccounts —
  // the program only stores the pubkeys, no validation at creation time.
  const createTableTx = await texasHoldemProgram.methods
    .createTable(bn(gameId), bn(smallBlind), bn(bigBlind))
    .accounts({
      pokerTable:    pokerTablePDA,
      gameSession:   gameSessionPDA,
      potMint:       DEVNET_USDC_MINT,   // USDC mint
      potAccount:    potAccountPDA,       // pot PDA (stored as reference)
      escrowAccount: escrowPDA,           // escrow PDA (stored as reference)
      creator:       texasHoldemProgram.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const tx = new Transaction().add(createGameTx).add(createTableTx);
  const signature = await cerberusPokerProgram.provider.sendAndConfirm(tx);

  return { signature, gameId, gameSessionPDA, pokerTablePDA };
}

export async function joinGame(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);

  const signature = await cerberusPokerProgram.methods
    .joinGame(bn(gameId))
    .accounts({
      gameSession: gameSessionPDA,
      player:      cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function startShuffle(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);

  const signature = await cerberusPokerProgram.methods
    .startShuffle(bn(gameId), randomOffset())
    .accounts({
      gameSession: gameSessionPDA,
      player:      cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function dealCards(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint,
  numPlayers: number
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);

  // 2 hole cards per player + 5 community cards (0xFF = community)
  const assignments: { cardIndex: number; playerIndex: number }[] = [];
  let cardIndex = 0;
  for (let p = 0; p < numPlayers; p++) {
    assignments.push({ cardIndex: cardIndex++, playerIndex: p });
    assignments.push({ cardIndex: cardIndex++, playerIndex: p });
  }
  for (let i = 0; i < 5; i++) {
    assignments.push({ cardIndex: cardIndex++, playerIndex: 0xff });
  }

  const signature = await cerberusPokerProgram.methods
    .dealCards(bn(gameId), assignments, randomOffset())
    .accounts({
      gameSession: gameSessionPDA,
      player:      cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

// ─── Betting ──────────────────────────────────────────────────────────────────

export async function playerAction(
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint,
  action: 'Fold' | 'Check' | 'Call' | 'Raise' | 'AllIn',
  amount: bigint = BigInt(0)
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA]  = derivePokerTablePDA(gameId);

  // Anchor enum variant: { fold: {} } | { check: {} } | etc.
  const actionEnum = { [action.charAt(0).toLowerCase() + action.slice(1)]: {} };

  const signature = await texasHoldemProgram.methods
    .playerAction(bn(gameId), actionEnum, bn(amount), randomOffset())
    .accounts({
      pokerTable:   pokerTablePDA,
      gameSession:  gameSessionPDA,
      player:       texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId, action };
}

export async function advancePhase(
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA]  = derivePokerTablePDA(gameId);

  const signature = await texasHoldemProgram.methods
    .advancePhase(bn(gameId))
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      caller:     texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function triggerShowdown(
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA]  = derivePokerTablePDA(gameId);

  const signature = await texasHoldemProgram.methods
    .showdown(bn(gameId))
    .accounts({
      pokerTable:  pokerTablePDA,
      gameSession: gameSessionPDA,
      caller:      texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

// ─── Timeouts ─────────────────────────────────────────────────────────────────

export async function timeoutShuffle(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);

  const signature = await cerberusPokerProgram.methods
    .timeoutShuffle(bn(gameId))
    .accounts({
      gameSession: gameSessionPDA,
      caller:      cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function timeoutReveal(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);

  const signature = await cerberusPokerProgram.methods
    .timeoutReveal(bn(gameId))
    .accounts({
      gameSession: gameSessionPDA,
      caller:      cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function timeoutBet(
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [pokerTablePDA] = derivePokerTablePDA(gameId);

  const signature = await texasHoldemProgram.methods
    .timeoutBet(bn(gameId))
    .accounts({
      pokerTable: pokerTablePDA,
      caller:     texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}
