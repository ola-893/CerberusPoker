/**
 * Transaction Builders
 *
 * Anchor's Borsh encoder requires BN (bn.js) for u64 fields — NOT JavaScript bigint.
 * All bigint values are converted via bn() before being passed to .methods().
 */

import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import {
  getArciumProgramId,
  getClockAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
} from '@arcium-hq/client';
import {
  deriveGameSessionPDA,
  derivePokerTablePDA,
  TEXAS_HOLDEM_PROGRAM_ID,
  CERBERUS_POKER_PROGRAM_ID,
  type AnchorProgramClient,
} from './anchor';
import { CLUSTER_OFFSET, DEMO_MAX_PLAYERS } from '../constants';

// ─── Constants ────────────────────────────────────────────────────────────────

// Devnet USDC mint (Circle's official devnet USDC)
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// Computation definition names (must match MXE circuits)
const COMP_DEF_NAMES = {
  SHUFFLE_DECK: 'shuffle_deck_demo',
  DEAL_CARD: 'deal_card_to_recipient',
  REVEAL_CARD: 'reveal_card',
  PLACE_BET: 'place_bet',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert JS bigint → BN for Anchor method calls */
const bn = (val: bigint | number): BN => new BN(val.toString());

/** Random u64 computation offset for MXE */
const randomOffset = (): BN => new BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString());

/** Derive escrow PDA for a game */
function deriveEscrowPDA(gameId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync([Buffer.from('escrow'), buf], TEXAS_HOLDEM_PROGRAM_ID);
}

/** Derive pot account PDA for a game */
function derivePotAccountPDA(gameId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync([Buffer.from('pot'), buf], TEXAS_HOLDEM_PROGRAM_ID);
}

/**
 * Derive all Arcium accounts for the program that queues the computation.
 * Arcium's Anchor macros use crate::ID as the MXE program id.
 */
function deriveArciumAccounts(programId: PublicKey, computationOffset: BN, compDefName: string) {
  const [signPdaAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('ArciumSignerAccount')],
    programId
  );

  const compDefOffset = Buffer.from(getCompDefAccOffset(compDefName)).readUInt32LE(0);

  return {
    signPdaAccount,
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
    executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
    computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
    compDefAccount: getCompDefAccAddress(programId, compDefOffset),
    clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
    poolAccount: getFeePoolAccAddress(),
    clockAccount: getClockAccAddress(),
    systemProgram: SystemProgram.programId,
    arciumProgram: getArciumProgramId(),
  };
}

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
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  const [escrowPDA] = deriveEscrowPDA(gameId);
  const [potAccountPDA] = derivePotAccountPDA(gameId);
  const demoMaxPlayers = Math.min(maxPlayers, DEMO_MAX_PLAYERS);

  // Step 1: create_game (cerberus_poker)
  const createGameTx = await cerberusPokerProgram.methods
    .createGame(bn(gameId), demoMaxPlayers, 52)
    .accounts({
      gameSession: gameSessionPDA,
      creator: cerberusPokerProgram.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  // Step 2: create_table (texas_holdem)
  // pot_mint, pot_account, escrow_account are UncheckedAccounts —
  // the program only stores the pubkeys, no validation at creation time.
  const createTableTx = await texasHoldemProgram.methods
    .createTable(bn(gameId), bn(smallBlind), bn(bigBlind))
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      potMint: DEVNET_USDC_MINT,   // USDC mint
      potAccount: potAccountPDA,       // pot PDA (stored as reference)
      escrowAccount: escrowPDA,           // escrow PDA (stored as reference)
      creator: texasHoldemProgram.provider.publicKey,
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
      player: cerberusPokerProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function startShuffle(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const computationOffset = randomOffset();
  const arcium = deriveArciumAccounts(
    CERBERUS_POKER_PROGRAM_ID,
    computationOffset,
    COMP_DEF_NAMES.SHUFFLE_DECK
  );

  const noncePDA = SystemProgram.programId;
  const deckCiphertext0 = SystemProgram.programId;

  const signature = await cerberusPokerProgram.methods
    .startShuffle(bn(gameId), computationOffset)
    .accounts({
      gameSession: gameSessionPDA,
      payer: cerberusPokerProgram.provider.publicKey,
      signPdaAccount: arcium.signPdaAccount,
      mxeAccount: arcium.mxeAccount,
      mempoolAccount: arcium.mempoolAccount,
      executingPool: arcium.executingPool,
      computationAccount: arcium.computationAccount,
      compDefAccount: arcium.compDefAccount,
      clusterAccount: arcium.clusterAccount,
      poolAccount: arcium.poolAccount,
      clockAccount: arcium.clockAccount,
      systemProgram: arcium.systemProgram,
      arciumProgram: arcium.arciumProgram,
      nonce: noncePDA,
      deckCiphertext0: deckCiphertext0,
    })
    .rpc();

  return { signature, gameId, computationOffset: BigInt(computationOffset.toString()) };
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
  const activePlayers = Math.min(numPlayers, DEMO_MAX_PLAYERS);
  for (let p = 0; p < activePlayers; p++) {
    assignments.push({ cardIndex: cardIndex++, playerIndex: p });
    assignments.push({ cardIndex: cardIndex++, playerIndex: p });
  }
  for (let i = 0; i < 5; i++) {
    assignments.push({ cardIndex: cardIndex++, playerIndex: 0xff });
  }

  const computationOffset = randomOffset();
  const arcium = deriveArciumAccounts(
    CERBERUS_POKER_PROGRAM_ID,
    computationOffset,
    COMP_DEF_NAMES.DEAL_CARD
  );

  const signature = await cerberusPokerProgram.methods
    .dealCards(bn(gameId), assignments, computationOffset)
    .accounts({
      gameSession: gameSessionPDA,
      payer: cerberusPokerProgram.provider.publicKey,
      signPdaAccount: arcium.signPdaAccount,
      mxeAccount: arcium.mxeAccount,
      mempoolAccount: arcium.mempoolAccount,
      executingPool: arcium.executingPool,
      computationAccount: arcium.computationAccount,
      compDefAccount: arcium.compDefAccount,
      clusterAccount: arcium.clusterAccount,
      poolAccount: arcium.poolAccount,
      clockAccount: arcium.clockAccount,
      systemProgram: arcium.systemProgram,
      arciumProgram: arcium.arciumProgram,
      encryptedCardC1: SystemProgram.programId,
      encryptedCardC2: SystemProgram.programId,
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
  const [pokerTablePDA] = derivePokerTablePDA(gameId);
  const [escrowPDA] = deriveEscrowPDA(gameId);
  const payerPubkey = texasHoldemProgram.provider.publicKey;
  const playerTokenAccount = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, payerPubkey);

  // Anchor enum variant: { fold: {} } | { check: {} } | etc.
  const actionEnum = { [action.charAt(0).toLowerCase() + action.slice(1)]: {} };

  const computationOffset = randomOffset();
  const arcium = deriveArciumAccounts(
    TEXAS_HOLDEM_PROGRAM_ID,
    computationOffset,
    COMP_DEF_NAMES.PLACE_BET
  );

  const signature = await texasHoldemProgram.methods
    .playerAction(bn(gameId), actionEnum, bn(amount), computationOffset)
    .accounts({
      pokerTable: pokerTablePDA,
      playerTokenAccount: playerTokenAccount,
      escrowAccount: escrowPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      payer: payerPubkey,
      signPdaAccount: arcium.signPdaAccount,
      mxeAccount: arcium.mxeAccount,
      mempoolAccount: arcium.mempoolAccount,
      executingPool: arcium.executingPool,
      computationAccount: arcium.computationAccount,
      compDefAccount: arcium.compDefAccount,
      clusterAccount: arcium.clusterAccount,
      poolAccount: arcium.poolAccount,
      clockAccount: arcium.clockAccount,
      systemProgram: arcium.systemProgram,
      arciumProgram: arcium.arciumProgram,
    })
    .rpc();

  return { signature, gameId, action };
}

export async function advancePhase(
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA] = derivePokerTablePDA(gameId);

  const signature = await texasHoldemProgram.methods
    .advancePhase(bn(gameId))
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      caller: texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}

export async function revealCard(
  cerberusPokerProgram: AnchorProgramClient,
  gameId: bigint,
  cardIndex: number
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);

  const computationOffset = randomOffset();
  const arcium = deriveArciumAccounts(
    CERBERUS_POKER_PROGRAM_ID,
    computationOffset,
    COMP_DEF_NAMES.REVEAL_CARD
  );

  const signature = await cerberusPokerProgram.methods
    .revealCard(bn(gameId), cardIndex, computationOffset)
    .accounts({
      gameSession: gameSessionPDA,
      payer: cerberusPokerProgram.provider.publicKey,
      signPdaAccount: arcium.signPdaAccount,
      mxeAccount: arcium.mxeAccount,
      mempoolAccount: arcium.mempoolAccount,
      executingPool: arcium.executingPool,
      computationAccount: arcium.computationAccount,
      compDefAccount: arcium.compDefAccount,
      clusterAccount: arcium.clusterAccount,
      poolAccount: arcium.poolAccount,
      clockAccount: arcium.clockAccount,
      systemProgram: arcium.systemProgram,
      arciumProgram: arcium.arciumProgram,
      encryptedCardC1: SystemProgram.programId,
      encryptedCardC2: SystemProgram.programId,
    })
    .rpc();

  return { signature, gameId, cardIndex };
}

export async function triggerShowdown(
  texasHoldemProgram: AnchorProgramClient,
  gameId: bigint
) {
  const [gameSessionPDA] = deriveGameSessionPDA(gameId);
  const [pokerTablePDA] = derivePokerTablePDA(gameId);

  const signature = await texasHoldemProgram.methods
    .showdown(bn(gameId))
    .accounts({
      pokerTable: pokerTablePDA,
      gameSession: gameSessionPDA,
      caller: texasHoldemProgram.provider.publicKey,
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
      caller: cerberusPokerProgram.provider.publicKey,
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
      caller: cerberusPokerProgram.provider.publicKey,
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
      caller: texasHoldemProgram.provider.publicKey,
    })
    .rpc();

  return { signature, gameId };
}
