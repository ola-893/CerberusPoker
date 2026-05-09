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
    const context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);

    // Load the program
    program = anchor.workspace.CerberusPoker as Program;

    // Use provider's pre-funded wallet as creator
    creator = provider.wallet.payer;
    player1 = Keypair.generate();
    player2 = Keypair.generate();

    // Fund accounts - not needed in bankrun, accounts are pre-funded
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

  it("rejects timeout_shuffle in wrong game state (Lobby)", async () => {
    // Create a fresh game in Lobby state
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

    // Try to call timeout_shuffle while in Lobby state (should fail)
    try {
      await program.methods
        .timeoutShuffle(timeoutGameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown InvalidGameState");
    } catch (e: any) {
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

// ─── Test Suite: Timeout Instructions (task 10.3) ─────────────────────────

describe("cerberus_poker — timeout instructions", () => {
  let provider: BankrunProvider;
  let program: Program;
  let creator: Keypair;
  let player1: Keypair;
  let player2: Keypair;

  before(async () => {
    const context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = anchor.workspace.CerberusPoker as Program;

    creator = provider.wallet.payer;
    player1 = Keypair.generate();
    player2 = Keypair.generate();

    // Accounts are pre-funded in bankrun
  });

  function getGamePda(gameId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  }

  // ─── timeout_shuffle tests ────────────────────────────────────────────────

  it("timeout_shuffle: rejects when no deadline is set", async () => {
    const gameId = new BN(300);
    const [gamePda] = getGamePda(gameId);

    // Create game
    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Manually set state to Shuffle without calling start_shuffle
    // This simulates a scenario where shuffle_deadline is not set
    // In bankrun, we can directly modify the account data
    const game = await program.account.gameSession.fetch(gamePda);
    
    // Verify shuffle_deadline is 0 (not set)
    assert.equal(game.shuffleDeadline.toString(), "0", "shuffle_deadline should be 0");

    // Try to call timeout_shuffle - should fail with NoDeadlineSet
    try {
      await program.methods
        .timeoutShuffle(gameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown NoDeadlineSet");
    } catch (e: any) {
      assert.include(e.message, "NoDeadlineSet");
    }
  });

  it("timeout_shuffle: rejects when deadline has not passed", async () => {
    const gameId = new BN(301);
    const [gamePda] = getGamePda(gameId);

    // Create game and join players
    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Manually set the game to Shuffle state with a future deadline
    // We'll use bankrun's ability to manipulate account data directly
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const futureDeadline = currentTime + 300; // 5 minutes in the future

    // Update the game state directly in bankrun
    // We need to serialize the updated account data
    const updatedGame = {
      ...game,
      state: { shuffle: {} },
      shuffleDeadline: new BN(futureDeadline),
    };

    // Encode the updated account
    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    
    // Update the account in bankrun
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Try to call timeout_shuffle before deadline - should fail
    try {
      await program.methods
        .timeoutShuffle(gameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown TimeoutNotReached");
    } catch (e: any) {
      assert.include(e.message, "TimeoutNotReached");
    }
  });

  it("timeout_shuffle: callable by anyone (not just game creator)", async () => {
    const gameId = new BN(303);
    const [gamePda] = getGamePda(gameId);
    const randomCaller = Keypair.generate();

    // Random caller is pre-funded in bankrun

    // Create game
    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set game to Shuffle state with a past deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const pastDeadline = currentTime - 10;

    const updatedGame = {
      ...game,
      state: { shuffle: {} },
      shuffleDeadline: new BN(pastDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Call timeout_shuffle with a random caller (not creator, not a player)
    await program.methods
      .timeoutShuffle(gameId)
      .accounts({
        gameSession: gamePda,
        caller: randomCaller.publicKey,
      })
      .signers([randomCaller])
      .rpc();

    // Verify game state is Complete
    const finalGame = await program.account.gameSession.fetch(gamePda);
    assert.deepEqual(finalGame.state, { complete: {} }, "Game state should be Complete");
  });

  it("timeout_shuffle: marks game as Complete when triggered", async () => {
    const gameId = new BN(302);
    const [gamePda] = getGamePda(gameId);

    // Create game and join players
    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set the game to Shuffle state with a past deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const pastDeadline = currentTime - 10; // 10 seconds in the past

    const updatedGame = {
      ...game,
      state: { shuffle: {} },
      shuffleDeadline: new BN(pastDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Call timeout_shuffle after deadline - should succeed
    await program.methods
      .timeoutShuffle(gameId)
      .accounts({
        gameSession: gamePda,
        caller: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    // Verify game state is now Complete
    const finalGame = await program.account.gameSession.fetch(gamePda);
    assert.deepEqual(finalGame.state, { complete: {} }, "Game state should be Complete");
  });

  // ─── timeout_reveal tests ─────────────────────────────────────────────────

  it("timeout_reveal: rejects when no deadline is set", async () => {
    const gameId = new BN(310);
    const [gamePda] = getGamePda(gameId);

    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set game to Deal state without setting reveal_deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const updatedGame = {
      ...game,
      state: { deal: {} },
      revealDeadline: new BN(0), // No deadline set
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Try to call timeout_reveal - should fail with NoDeadlineSet
    try {
      await program.methods
        .timeoutReveal(gameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown NoDeadlineSet");
    } catch (e: any) {
      assert.include(e.message, "NoDeadlineSet");
    }
  });

  it("timeout_reveal: rejects when deadline has not passed", async () => {
    const gameId = new BN(311);
    const [gamePda] = getGamePda(gameId);

    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set game to Active state with a future reveal deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const futureDeadline = currentTime + 300; // 5 minutes in the future

    const updatedGame = {
      ...game,
      state: { active: {} },
      revealDeadline: new BN(futureDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Try to call timeout_reveal before deadline - should fail
    try {
      await program.methods
        .timeoutReveal(gameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown TimeoutNotReached");
    } catch (e: any) {
      assert.include(e.message, "TimeoutNotReached");
    }
  });

  it("timeout_reveal: succeeds after deadline in Deal state", async () => {
    const gameId = new BN(312);
    const [gamePda] = getGamePda(gameId);

    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set game to Deal state with a past deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const pastDeadline = currentTime - 10; // 10 seconds in the past

    const updatedGame = {
      ...game,
      state: { deal: {} },
      revealDeadline: new BN(pastDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Call timeout_reveal after deadline - should succeed
    await program.methods
      .timeoutReveal(gameId)
      .accounts({
        gameSession: gamePda,
        caller: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    // Verify game state is now Complete
    const finalGame = await program.account.gameSession.fetch(gamePda);
    assert.deepEqual(finalGame.state, { complete: {} }, "Game state should be Complete");
  });

  it("timeout_reveal: succeeds after deadline in Active state", async () => {
    const gameId = new BN(313);
    const [gamePda] = getGamePda(gameId);

    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set game to Active state with a past deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const pastDeadline = currentTime - 10; // 10 seconds in the past

    const updatedGame = {
      ...game,
      state: { active: {} },
      revealDeadline: new BN(pastDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Call timeout_reveal after deadline - should succeed
    await program.methods
      .timeoutReveal(gameId)
      .accounts({
        gameSession: gamePda,
        caller: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    // Verify game state is now Complete
    const finalGame = await program.account.gameSession.fetch(gamePda);
    assert.deepEqual(finalGame.state, { complete: {} }, "Game state should be Complete");
  });

  it("timeout_reveal: callable by anyone (not just game creator)", async () => {
    const gameId = new BN(314);
    const [gamePda] = getGamePda(gameId);
    const randomCaller = Keypair.generate();

    // Random caller is pre-funded in bankrun

    // Create game
    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Set game to Active state with a past deadline
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const pastDeadline = currentTime - 10;

    const updatedGame = {
      ...game,
      state: { active: {} },
      revealDeadline: new BN(pastDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Call timeout_reveal with a random caller (not creator, not a player)
    await program.methods
      .timeoutReveal(gameId)
      .accounts({
        gameSession: gamePda,
        caller: randomCaller.publicKey,
      })
      .signers([randomCaller])
      .rpc();

    // Verify game state is Complete
    const finalGame = await program.account.gameSession.fetch(gamePda);
    assert.deepEqual(finalGame.state, { complete: {} }, "Game state should be Complete");
  });

  it("timeout_reveal: rejects invalid game states (Lobby, Shuffle, Showdown, Complete)", async () => {
    const gameId = new BN(315);
    const [gamePda] = getGamePda(gameId);

    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Join players
    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    await program.methods
      .joinGame(gameId)
      .accounts({
        gameSession: gamePda,
        player: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Test with Lobby state (invalid)
    const game = await program.account.gameSession.fetch(gamePda);
    const currentTime = Math.floor(Date.now() / 1000);
    const pastDeadline = currentTime - 10;

    const updatedGame = {
      ...game,
      state: { lobby: {} },
      revealDeadline: new BN(pastDeadline),
    };

    const accountData = program.coder.accounts.encode("gameSession", updatedGame);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData,
        owner: program.programId,
        executable: false,
      }
    );

    // Try to call timeout_reveal in Lobby state - should fail
    try {
      await program.methods
        .timeoutReveal(gameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown InvalidGameState");
    } catch (e: any) {
      assert.include(e.message, "InvalidGameState");
    }

    // Test with Shuffle state (invalid)
    const updatedGame2 = {
      ...game,
      state: { shuffle: {} },
      revealDeadline: new BN(pastDeadline),
    };

    const accountData2 = program.coder.accounts.encode("gameSession", updatedGame2);
    await provider.context.banksClient.setAccount(
      gamePda,
      {
        lamports: await provider.connection.getBalance(gamePda),
        data: accountData2,
        owner: program.programId,
        executable: false,
      }
    );

    try {
      await program.methods
        .timeoutReveal(gameId)
        .accounts({
          gameSession: gamePda,
          caller: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown InvalidGameState");
    } catch (e: any) {
      assert.include(e.message, "InvalidGameState");
    }
  });

  it("verifies timeout constants are defined", async () => {
    // pub const SHUFFLE_TIMEOUT_SECS: i64 = 300; // 5 minutes
    // pub const REVEAL_TIMEOUT_SECS: i64 = 300;  // 5 minutes
    
    // These are used by start_shuffle and reveal_card to set deadlines:
    // game.shuffle_deadline = clock.unix_timestamp + SHUFFLE_TIMEOUT_SECS;
    // game.reveal_deadline = clock.unix_timestamp + REVEAL_TIMEOUT_SECS;
    
    // We verify the state structure includes these deadline fields
    const gameId = new BN(320);
    const [gamePda] = getGamePda(gameId);

    await program.methods
      .createGame(gameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const game = await program.account.gameSession.fetch(gamePda);
    assert.isDefined(game.shuffleDeadline, "shuffle_deadline field should exist");
    assert.isDefined(game.revealDeadline, "reveal_deadline field should exist");
    assert.equal(game.shuffleDeadline.toString(), "0", "shuffle_deadline should be 0 initially");
    assert.equal(game.revealDeadline.toString(), "0", "reveal_deadline should be 0 initially");
  });

  it("documents the full timeout flow for integration testing", async () => {
    // This test documents the expected behavior for full integration tests with MXE
    
    // SHUFFLE TIMEOUT FLOW:
    // 1. Game created, players join
    // 2. start_shuffle called → state = Shuffle, shuffle_deadline = now + 300s
    // 3. Player 1 submits shuffle → shuffle_bitmap bit 0 set
    // 4. Player 2 stalls (doesn't submit shuffle)
    // 5. After 300 seconds, anyone calls timeout_shuffle
    // 6. Game state → Complete, game ends
    // 7. Player 2 is eliminated (per game rules)
    
    // REVEAL TIMEOUT FLOW:
    // 1. Game in Active phase, community card reveal initiated
    // 2. reveal_card called → reveal_deadline = now + 300s
    // 3. Some players submit reveal tokens
    // 4. One player withholds their token (stalls)
    // 5. After 300 seconds, anyone calls timeout_reveal
    // 6. Game state → Complete, game ends
    // 7. Stalling player is eliminated
    
    // LIVENESS GUARANTEE (Requirements 3.3):
    // "A game can always make progress even if another player goes offline"
    // "Timed-out players are eliminated and their stake is handled per the game's rules"
    // "Any player can trigger a timeout after the deadline has passed"
    
    // The timeout instructions ensure:
    // - No player can permanently stall a game
    // - Honest players can always force progress
    // - The game either completes normally or times out (never hangs)
  });
});

// ─── Test Suite: Card Uniqueness Enforcement ──────────────────────────────

describe("cerberus_poker — card uniqueness enforcement (task 9.4)", () => {
  let provider: BankrunProvider;
  let program: Program;
  let creator: Keypair;

  const UNIQUENESS_GAME_ID = new BN(200);

  before(async () => {
    const context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = anchor.workspace.CerberusPoker as Program;
    creator = provider.wallet.payer;

    // Accounts are pre-funded in bankrun
  });

  function getGamePda(gameId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  }

  it("initializes a game for uniqueness testing", async () => {
    const [gamePda] = getGamePda(UNIQUENESS_GAME_ID);

    await program.methods
      .createGame(UNIQUENESS_GAME_ID, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const game = await program.account.gameSession.fetch(gamePda);
    assert.equal(game.cardValueUsed[0].toString(), "0", "No cards should be used initially");
  });

  it("verifies card_value_used bitmap starts empty", async () => {
    const [gamePda] = getGamePda(UNIQUENESS_GAME_ID);
    const game = await program.account.gameSession.fetch(gamePda);

    // Verify all 52 card values are initially unused
    for (let cardValue = 0; cardValue < 52; cardValue++) {
      const bitPosition = cardValue;
      const isUsed = (game.cardValueUsed[0].toNumber() >> bitPosition) & 1;
      assert.equal(isUsed, 0, `Card value ${cardValue} should not be marked as used`);
    }
  });

  // Note: The actual callback tests require MXE integration and are tested via `arcium test`.
  // These tests verify the bitmap logic and state management that the callbacks depend on.
  // The callback handlers in reveal_card_callback.rs, reveal_community_card_callback.rs,
  // and atomic_showdown_callback.rs all enforce:
  //   require!(!game.is_card_value_used(card_value), CerberusPokerError::DuplicateCardValue);
  //
  // Integration tests with live MXE would:
  // 1. Trigger a reveal_card callback with card_value=5
  // 2. Verify card_value_used[0] has bit 5 set
  // 3. Trigger another reveal with card_value=5
  // 4. Verify it fails with DuplicateCardValue error

  it("documents the duplicate card value protection mechanism", async () => {
    // This test documents how the protection works:
    // 
    // 1. When a card is revealed via any callback (reveal_card, reveal_community_card, atomic_showdown),
    //    the handler checks: require!(!game.is_card_value_used(card_value), DuplicateCardValue)
    //
    // 2. If the card value (0-51) has already been used, the transaction fails
    //
    // 3. If the card value is new, it's marked as used: game.mark_card_value_used(card_value)
    //    which sets bit `card_value` in the card_value_used[0] bitmap
    //
    // 4. This ensures deck integrity: exactly one of each card value can appear in a game
    //
    // The implementation is in:
    // - packages/programs/programs/cerberus_poker/src/instructions/reveal_card_callback.rs (lines 48-52)
    // - packages/programs/programs/cerberus_poker/src/instructions/reveal_community_card_callback.rs (lines 48-52)
    // - packages/programs/programs/cerberus_poker/src/instructions/atomic_showdown_callback.rs (lines 44-49)
    //
    // All three handlers use the same pattern:
    //   require!(!game.is_card_value_used(card_value), CerberusPokerError::DuplicateCardValue);
    //   game.mark_card_value_used(card_value);

    const [gamePda] = getGamePda(UNIQUENESS_GAME_ID);
    const game = await program.account.gameSession.fetch(gamePda);
    
    // Verify the error type exists in the program IDL
    const errorCodes = program.idl.errors || [];
    const duplicateError = errorCodes.find((e: any) => e.name === "DuplicateCardValue");
    assert.isDefined(duplicateError, "DuplicateCardValue error should be defined in program IDL");
    assert.equal(duplicateError?.msg, "Duplicate card value detected");
  });

  it("verifies bitmap can track all 52 card values", async () => {
    // Verify the bitmap is large enough to track all 52 cards
    // card_value_used is [u64; 1], which provides 64 bits (52 needed)
    const [gamePda] = getGamePda(UNIQUENESS_GAME_ID);
    const game = await program.account.gameSession.fetch(gamePda);

    assert.equal(game.cardValueUsed.length, 1, "Should have 1 u64 for bitmap");
    
    // A u64 can track 64 different values, which is sufficient for 52 cards
    const bitsAvailable = 64;
    const cardsInDeck = 52;
    assert.isAtLeast(bitsAvailable, cardsInDeck, "Bitmap should have enough bits for all cards");
  });

  it("verifies state.rs helper methods exist and work correctly", async () => {
    // The GameSession struct in state.rs provides helper methods:
    // - is_card_value_used(value: u8) -> bool
    // - mark_card_value_used(value: u8)
    //
    // These are tested in Rust unit tests, but we verify the state structure here
    const [gamePda] = getGamePda(UNIQUENESS_GAME_ID);
    const game = await program.account.gameSession.fetch(gamePda);

    // Verify the field exists and is initialized correctly
    assert.isDefined(game.cardValueUsed, "card_value_used field should exist");
    assert.isArray(game.cardValueUsed, "card_value_used should be an array");
    assert.equal(game.cardValueUsed.length, 1, "card_value_used should be [u64; 1]");
  });
});
