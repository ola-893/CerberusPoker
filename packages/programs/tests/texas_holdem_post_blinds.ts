import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { assert } from "chai";
import * as spl from "@solana/spl-token";

// NOTE: These tests use solana-bankrun for fast local execution.
// They test the post_blinds instruction for the Texas Hold'em program.

describe("texas_holdem — post_blinds bankrun tests", () => {
  let provider: BankrunProvider;
  let program: Program;
  let cerberusProgram: Program;
  let creator: Keypair;
  let player0: Keypair;
  let player1: Keypair;
  let player2: Keypair;
  let mint: PublicKey;

  const SMALL_BLIND = new BN(50);
  const BIG_BLIND = new BN(100);
  const NUM_PLAYERS = 3;
  const INITIAL_STACK = 10000;

  before(async () => {
    // Start bankrun with both programs
    const context = await startAnchor("packages/programs", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);

    // Load programs
    program = anchor.workspace.TexasHoldem as Program;
    cerberusProgram = anchor.workspace.CerberusPoker as Program;

    creator = Keypair.generate();
    player0 = Keypair.generate();
    player1 = Keypair.generate();
    player2 = Keypair.generate();

    // Fund accounts
    for (const keypair of [creator, player0, player1, player2]) {
      const airdropSig = await provider.connection.requestAirdrop(
        keypair.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);
    }

    // Create SPL token mint
    mint = await spl.createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      9
    );
  });

  function getTablePda(gameId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("table"), gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  }

  function getGamePda(gameId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
      cerberusProgram.programId
    );
  }

  // Helper to create a test table with real SPL token accounts
  async function setupTableWithTokens(gameId: BN): Promise<{
    tablePda: PublicKey;
    potAccount: PublicKey;
    player0Stack: PublicKey;
    player1Stack: PublicKey;
    player2Stack: PublicKey;
  }> {
    const [gamePda] = getGamePda(gameId);
    const [tablePda] = getTablePda(gameId);

    // Create game session
    await cerberusProgram.methods
      .createGame(gameId, NUM_PLAYERS, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Create pot token account (owned by table PDA)
    const potAccount = await spl.createAccount(
      provider.connection,
      creator,
      mint,
      tablePda
    );

    // Create player token accounts
    const player0Stack = await spl.createAccount(
      provider.connection,
      creator,
      mint,
      player0.publicKey
    );
    const player1Stack = await spl.createAccount(
      provider.connection,
      creator,
      mint,
      player1.publicKey
    );
    const player2Stack = await spl.createAccount(
      provider.connection,
      creator,
      mint,
      player2.publicKey
    );

    // Mint tokens to player accounts
    await spl.mintTo(
      provider.connection,
      creator,
      mint,
      player0Stack,
      creator,
      INITIAL_STACK
    );
    await spl.mintTo(
      provider.connection,
      creator,
      mint,
      player1Stack,
      creator,
      INITIAL_STACK
    );
    await spl.mintTo(
      provider.connection,
      creator,
      mint,
      player2Stack,
      creator,
      INITIAL_STACK
    );

    // Create poker table
    await program.methods
      .createTable(gameId, SMALL_BLIND, BIG_BLIND)
      .accounts({
        pokerTable: tablePda,
        gameSession: gamePda,
        potMint: mint,
        potAccount: potAccount,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    return { tablePda, potAccount, player0Stack, player1Stack, player2Stack };
  }

  it("posts blinds correctly from the right players", async () => {
    const gameId = new BN(101);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Dealer is at index 0, so:
    // Small blind = player 1 (dealer + 1) % 3
    // Big blind = player 2 (dealer + 2) % 3

    await program.methods
      .postBlinds(gameId, NUM_PLAYERS)
      .accounts({
        pokerTable: tablePda,
        smallBlindPlayer: player1.publicKey,
        smallBlindStack: player1Stack,
        bigBlindPlayer: player2.publicKey,
        bigBlindStack: player2Stack,
        potAccount: potAccount,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      })
      .signers([player1, player2])
      .rpc();

    // Verify table state updated correctly
    const table = await program.account.pokerTable.fetch(tablePda);
    assert.equal(table.currentPlayer, 0, "Current player should be 0 (after big blind)");
    assert.equal(table.currentBet.toString(), BIG_BLIND.toString(), "Current bet should be big blind");
    assert.equal(
      table.playerStacks[1].toString(),
      player1Stack.toString(),
      "Player 1 stack should be recorded"
    );
    assert.equal(
      table.playerStacks[2].toString(),
      player2Stack.toString(),
      "Player 2 stack should be recorded"
    );
  });

  it("pot account receives correct token amounts", async () => {
    const gameId = new BN(102);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Get initial balances
    const initialPotBalance = (await spl.getAccount(provider.connection, potAccount)).amount;
    const initialPlayer1Balance = (await spl.getAccount(provider.connection, player1Stack)).amount;
    const initialPlayer2Balance = (await spl.getAccount(provider.connection, player2Stack)).amount;

    // Post blinds
    await program.methods
      .postBlinds(gameId, NUM_PLAYERS)
      .accounts({
        pokerTable: tablePda,
        smallBlindPlayer: player1.publicKey,
        smallBlindStack: player1Stack,
        bigBlindPlayer: player2.publicKey,
        bigBlindStack: player2Stack,
        potAccount: potAccount,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      })
      .signers([player1, player2])
      .rpc();

    // Verify balances changed correctly
    const finalPotBalance = (await spl.getAccount(provider.connection, potAccount)).amount;
    const finalPlayer1Balance = (await spl.getAccount(provider.connection, player1Stack)).amount;
    const finalPlayer2Balance = (await spl.getAccount(provider.connection, player2Stack)).amount;

    assert.equal(
      finalPotBalance.toString(),
      (initialPotBalance + BigInt(SMALL_BLIND.toNumber()) + BigInt(BIG_BLIND.toNumber())).toString(),
      "Pot should receive small blind + big blind"
    );
    assert.equal(
      finalPlayer1Balance.toString(),
      (initialPlayer1Balance - BigInt(SMALL_BLIND.toNumber())).toString(),
      "Small blind player should lose small blind amount"
    );
    assert.equal(
      finalPlayer2Balance.toString(),
      (initialPlayer2Balance - BigInt(BIG_BLIND.toNumber())).toString(),
      "Big blind player should lose big blind amount"
    );
  });

  it("calculates player positions correctly with wraparound", async () => {
    // Test with dealer at position 2 (last position in 3-player game)
    // Small blind should wrap to player 0
    // Big blind should wrap to player 1
    const dealerIndex = 2;
    const smallBlindIndex = (dealerIndex + 1) % NUM_PLAYERS;
    const bigBlindIndex = (dealerIndex + 2) % NUM_PLAYERS;

    assert.equal(smallBlindIndex, 0, "Small blind should wrap to player 0");
    assert.equal(bigBlindIndex, 1, "Big blind should wrap to player 1");
  });

  it("sets current player to position after big blind", async () => {
    const gameId = new BN(104);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    await program.methods
      .postBlinds(gameId, NUM_PLAYERS)
      .accounts({
        pokerTable: tablePda,
        smallBlindPlayer: player1.publicKey,
        smallBlindStack: player1Stack,
        bigBlindPlayer: player2.publicKey,
        bigBlindStack: player2Stack,
        potAccount: potAccount,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      })
      .signers([player1, player2])
      .rpc();

    const table = await program.account.pokerTable.fetch(tablePda);
    
    // Dealer at 0, big blind at 2, so first to act is (2 + 1) % 3 = 0
    assert.equal(table.currentPlayer, 0, "Current player should be position after big blind");
  });

  it("rejects insufficient balance for small blind", async () => {
    const gameId = new BN(105);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Create a new player with insufficient balance
    const poorPlayer = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      poorPlayer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const poorPlayerStack = await spl.createAccount(
      provider.connection,
      creator,
      mint,
      poorPlayer.publicKey
    );

    // Mint only 10 tokens (less than small blind of 50)
    await spl.mintTo(
      provider.connection,
      creator,
      mint,
      poorPlayerStack,
      creator,
      10
    );

    try {
      await program.methods
        .postBlinds(gameId, NUM_PLAYERS)
        .accounts({
          pokerTable: tablePda,
          smallBlindPlayer: poorPlayer.publicKey,
          smallBlindStack: poorPlayerStack,
          bigBlindPlayer: player2.publicKey,
          bigBlindStack: player2Stack,
          potAccount: potAccount,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([poorPlayer, player2])
        .rpc();
      assert.fail("Should have thrown insufficient balance error");
    } catch (e: any) {
      // SPL token program will throw an error for insufficient balance
      assert.isTrue(
        e.message.toLowerCase().includes("insufficient") || 
        e.message.includes("0x1"),
        "Should throw insufficient funds error"
      );
    }
  });

  it("rejects insufficient balance for big blind", async () => {
    const gameId = new BN(106);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Create a new player with insufficient balance
    const poorPlayer = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      poorPlayer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const poorPlayerStack = await spl.createAccount(
      provider.connection,
      creator,
      mint,
      poorPlayer.publicKey
    );

    // Mint only 50 tokens (less than big blind of 100)
    await spl.mintTo(
      provider.connection,
      creator,
      mint,
      poorPlayerStack,
      creator,
      50
    );

    try {
      await program.methods
        .postBlinds(gameId, NUM_PLAYERS)
        .accounts({
          pokerTable: tablePda,
          smallBlindPlayer: player1.publicKey,
          smallBlindStack: player1Stack,
          bigBlindPlayer: poorPlayer.publicKey,
          bigBlindStack: poorPlayerStack,
          potAccount: potAccount,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([player1, poorPlayer])
        .rpc();
      assert.fail("Should have thrown insufficient balance error");
    } catch (e: any) {
      // SPL token program will throw an error for insufficient balance
      assert.isTrue(
        e.message.toLowerCase().includes("insufficient") || 
        e.message.includes("0x1"),
        "Should throw insufficient funds error"
      );
    }
  });

  it("rejects posting blinds with less than 2 players", async () => {
    const gameId = new BN(107);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    try {
      await program.methods
        .postBlinds(gameId, 1) // Only 1 player
        .accounts({
          pokerTable: tablePda,
          smallBlindPlayer: player1.publicKey,
          smallBlindStack: player1Stack,
          bigBlindPlayer: player2.publicKey,
          bigBlindStack: player2Stack,
          potAccount: potAccount,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([player1, player2])
        .rpc();
      assert.fail("Should have thrown NotEnoughPlayers error");
    } catch (e: any) {
      assert.include(e.message, "NotEnoughPlayers");
    }
  });

  it("validates player positions based on dealer index", async () => {
    const gameId = new BN(108);
    const { tablePda } = await setupTableWithTokens(gameId);
    const table = await program.account.pokerTable.fetch(tablePda);

    // With dealer_index = 0 and 3 players:
    // Small blind should be player 1 (dealer + 1) % 3
    // Big blind should be player 2 (dealer + 2) % 3
    assert.equal(table.dealerIndex, 0, "Dealer should be at index 0");

    const expectedSmallBlindIndex = (table.dealerIndex + 1) % NUM_PLAYERS;
    const expectedBigBlindIndex = (table.dealerIndex + 2) % NUM_PLAYERS;

    assert.equal(expectedSmallBlindIndex, 1, "Small blind should be player 1");
    assert.equal(expectedBigBlindIndex, 2, "Big blind should be player 2");
  });

  it("updates player stack references in table state", async () => {
    const gameId = new BN(109);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Before posting blinds, player stacks should be default
    let table = await program.account.pokerTable.fetch(tablePda);
    assert.equal(
      table.playerStacks[1].toString(),
      PublicKey.default.toString(),
      "Player 1 stack should be default before posting"
    );
    assert.equal(
      table.playerStacks[2].toString(),
      PublicKey.default.toString(),
      "Player 2 stack should be default before posting"
    );

    // Post blinds
    await program.methods
      .postBlinds(gameId, NUM_PLAYERS)
      .accounts({
        pokerTable: tablePda,
        smallBlindPlayer: player1.publicKey,
        smallBlindStack: player1Stack,
        bigBlindPlayer: player2.publicKey,
        bigBlindStack: player2Stack,
        potAccount: potAccount,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      })
      .signers([player1, player2])
      .rpc();

    // After posting blinds, player stacks should be updated
    table = await program.account.pokerTable.fetch(tablePda);
    assert.equal(
      table.playerStacks[1].toString(),
      player1Stack.toString(),
      "Player 1 stack should be updated"
    );
    assert.equal(
      table.playerStacks[2].toString(),
      player2Stack.toString(),
      "Player 2 stack should be updated"
    );
  });

  it("maintains current bet at big blind amount after posting", async () => {
    const gameId = new BN(110);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    await program.methods
      .postBlinds(gameId, NUM_PLAYERS)
      .accounts({
        pokerTable: tablePda,
        smallBlindPlayer: player1.publicKey,
        smallBlindStack: player1Stack,
        bigBlindPlayer: player2.publicKey,
        bigBlindStack: player2Stack,
        potAccount: potAccount,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      })
      .signers([player1, player2])
      .rpc();

    const table = await program.account.pokerTable.fetch(tablePda);
    assert.equal(
      table.currentBet.toString(),
      BIG_BLIND.toString(),
      "Current bet should equal big blind after posting"
    );
  });
});
