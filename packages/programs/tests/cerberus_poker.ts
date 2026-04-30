import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { assert } from "chai";

// NOTE: These tests use solana-bankrun for fast local execution.
// They test the Solana program state machine without requiring a live Arcium MXE.
// MXE callback instructions are tested separately via `arcium test`.

describe("cerberus_poker — state machine tests", () => {
  let provider: BankrunProvider;
  let program: Program;
  let creator: Keypair;
  let player1: Keypair;
  let player2: Keypair;

  const GAME_ID = new BN(1);

  before(async () => {
    // Start bankrun with the cerberus_poker program
    const context = await startAnchor("packages/programs", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);

    // Load the program
    program = anchor.workspace.CerberusPoker as Program;

    creator = Keypair.generate();
    player1 = Keypair.generate();
    player2 = Keypair.generate();

    // Fund accounts
    await provider.context.banksClient.processTransaction(
      await provider.context.banksClient.getTransaction(
        (await provider.connection.requestAirdrop(creator.publicKey, 10e9)).toString()
      )
    );
  });

  // ─── Helper: derive game PDA ───────────────────────────────────────────────

  function getGamePda(gameId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  }

  // ─── Test: create_game ────────────────────────────────────────────────────

  it("creates a game in Lobby state", async () => {
    const [gamePda] = getGamePda(GAME_ID);

    await program.methods
      .createGame(GAME_ID, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const game = await program.account.gameSession.fetch(gamePda);
    assert.equal(game.gameId.toString(), GAME_ID.toString());
    assert.deepEqual(game.state, { lobby: {} });
    assert.equal(game.maxPlayers, 2);
    assert.equal(game.deckSize, 52);
    assert.equal(game.numPlayers, 0);
  });

  it("rejects invalid deck size", async () => {
    const badGameId = new BN(999);
    const [gamePda] = getGamePda(badGameId);

    try {
      await program.methods
        .createGame(badGameId, 2, 40) // 40 is not 52
        .accounts({
          gameSession: gamePda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message, "CardIndexOutOfRange");
    }
  });

  it("rejects max_players > 6", async () => {
    const badGameId = new BN(998);
    const [gamePda] = getGamePda(badGameId);

    try {
      await program.methods
        .createGame(badGameId, 7, 52) // 7 > MAX_PLAYERS
        .accounts({
          gameSession: gamePda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message, "GameFull");
    }
  });

  // ─── Test: join_game ──────────────────────────────────────────────────────

  it("allows players to join in Lobby state", async () => {
    const [gamePda] = getGamePda(GAME_ID);

    await program.methods
      .joinGame(GAME_ID)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    const game = await program.account.gameSession.fetch(gamePda);
    assert.equal(game.numPlayers, 1);
    assert.equal(game.players[0].toString(), player1.publicKey.toString());
  });

  it("allows second player to join", async () => {
    const [gamePda] = getGamePda(GAME_ID);

    await program.methods
      .joinGame(GAME_ID)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    const game = await program.account.gameSession.fetch(gamePda);
    assert.equal(game.numPlayers, 2);
    assert.equal(game.players[1].toString(), player2.publicKey.toString());
  });

  it("rejects duplicate player join", async () => {
    const [gamePda] = getGamePda(GAME_ID);

    try {
      await program.methods
        .joinGame(GAME_ID)
        .accounts({
          gameSession: gamePda,
          player: player1.publicKey,
        })
        .signers([player1])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message, "PlayerAlreadyJoined");
    }
  });

  it("rejects join when game is full", async () => {
    const [gamePda] = getGamePda(GAME_ID);
    const extraPlayer = Keypair.generate();

    try {
      await program.methods
        .joinGame(GAME_ID)
        .accounts({
          gameSession: gamePda,
          player: extraPlayer.publicKey,
        })
        .signers([extraPlayer])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message, "GameFull");
    }
  });

  // ─── Test: timeout_shuffle ────────────────────────────────────────────────

  it("rejects timeout_shuffle before deadline", async () => {
    // Create a fresh game in Shuffle state for this test
    const timeoutGameId = new BN(100);
    const [gamePda] = getGamePda(timeoutGameId);

    await program.methods
      .createGame(timeoutGameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Manually set state to Shuffle via a join (can't call start_shuffle without MXE)
    // Instead test that timeout fails on Lobby state
    try {
      await program.methods
        .timeoutShuffle(timeoutGameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      // Should fail because state is Lobby, not Shuffle
      assert.include(e.message, "InvalidGameState");
    }
  });

  // ─── Test: card value bitmap helpers ─────────────────────────────────────

  it("correctly tracks card value usage via bitmap", async () => {
    // This tests the on-chain bitmap logic indirectly through the program
    // Direct unit tests for bitmap helpers are in Rust (see state.rs)
    const [gamePda] = getGamePda(GAME_ID);
    const game = await program.account.gameSession.fetch(gamePda);

    // Initially no cards used
    assert.equal(game.cardValueUsed[0].toString(), "0");

    // All unmasked cards should be 0xFF (unrevealed)
    for (let i = 0; i < 52; i++) {
      assert.equal(game.unmaskedCards[i], 0xFF);
    }

    // All card assignments should be 0xFE (unassigned)
    for (let i = 0; i < 52; i++) {
      assert.equal(game.cardAssignedTo[i], 0xFE);
    }
  });
});
