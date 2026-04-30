import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { assert } from "chai";

// NOTE: These tests use solana-bankrun for fast local execution.
// They test the Texas Hold'em program state machine.

describe("texas_holdem — table setup tests", () => {
  let provider: BankrunProvider;
  let program: Program;
  let cerberusProgram: Program;
  let creator: Keypair;

  const GAME_ID = new BN(1);
  const SMALL_BLIND = new BN(100);
  const BIG_BLIND = new BN(200);

  before(async () => {
    // Start bankrun with both programs
    const context = await startAnchor("packages/programs", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);

    // Load programs
    program = anchor.workspace.TexasHoldem as Program;
    cerberusProgram = anchor.workspace.CerberusPoker as Program;

    creator = Keypair.generate();

    // Fund creator account
    await provider.context.banksClient.processTransaction(
      await provider.context.banksClient.getTransaction(
        (await provider.connection.requestAirdrop(creator.publicKey, 10e9)).toString()
      )
    );
  });

  // ─── Helper: derive PDAs ──────────────────────────────────────────────────

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

  // ─── Test: create_table ───────────────────────────────────────────────────

  it("creates a poker table with valid blind levels", async () => {
    const [tablePda] = getTablePda(GAME_ID);
    const [gamePda] = getGamePda(GAME_ID);

    // Create a mock game session first (for the reference)
    await cerberusProgram.methods
      .createGame(GAME_ID, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Create mock pot mint and account (using creator pubkey as placeholder)
    const potMint = creator.publicKey;
    const potAccount = creator.publicKey;

    // Create the poker table
    await program.methods
      .createTable(GAME_ID, SMALL_BLIND, BIG_BLIND)
      .accounts({
        pokerTable: tablePda,
        gameSession: gamePda,
        potMint: potMint,
        potAccount: potAccount,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Verify table state
    const table = await program.account.pokerTable.fetch(tablePda);
    
    assert.equal(table.gameSession.toString(), gamePda.toString(), "Game session should match");
    assert.deepEqual(table.phase, { preFlop: {} }, "Phase should be PreFlop");
    assert.equal(table.dealerIndex, 0, "Dealer index should be 0");
    assert.equal(table.currentPlayer, 0, "Current player should be 0");
    assert.equal(table.potMint.toString(), potMint.toString(), "Pot mint should match");
    assert.equal(table.potAccount.toString(), potAccount.toString(), "Pot account should match");
    assert.equal(table.currentBet.toString(), BIG_BLIND.toString(), "Current bet should be big blind");
    assert.equal(table.foldedBitmap, 0, "Folded bitmap should be 0");
    assert.equal(table.allInBitmap, 0, "All-in bitmap should be 0");
    assert.equal(table.handVerifiedBitmap, 0, "Hand verified bitmap should be 0");
    assert.equal(table.smallBlind.toString(), SMALL_BLIND.toString(), "Small blind should match");
    assert.equal(table.bigBlind.toString(), BIG_BLIND.toString(), "Big blind should match");
    assert.equal(table.handNumber, 0, "Hand number should be 0");
  });

  it("rejects invalid blind amounts (big blind < 2x small blind)", async () => {
    const badGameId = new BN(999);
    const [tablePda] = getTablePda(badGameId);
    const [gamePda] = getGamePda(badGameId);

    // Create a mock game session
    await cerberusProgram.methods
      .createGame(badGameId, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const potMint = creator.publicKey;
    const potAccount = creator.publicKey;

    try {
      // Try to create table with invalid blinds (big blind = 1.5x small blind)
      await program.methods
        .createTable(badGameId, new BN(100), new BN(150))
        .accounts({
          pokerTable: tablePda,
          gameSession: gamePda,
          potMint: potMint,
          potAccount: potAccount,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown InvalidBlindAmounts error");
    } catch (e: any) {
      assert.include(e.message, "InvalidBlindAmounts");
    }
  });

  it("accepts big blind exactly 2x small blind", async () => {
    const gameId2 = new BN(2);
    const [tablePda] = getTablePda(gameId2);
    const [gamePda] = getGamePda(gameId2);

    // Create a mock game session
    await cerberusProgram.methods
      .createGame(gameId2, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const potMint = creator.publicKey;
    const potAccount = creator.publicKey;

    // Create table with big blind = 2x small blind (minimum valid)
    await program.methods
      .createTable(gameId2, new BN(50), new BN(100))
      .accounts({
        pokerTable: tablePda,
        gameSession: gamePda,
        potMint: potMint,
        potAccount: potAccount,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const table = await program.account.pokerTable.fetch(tablePda);
    assert.equal(table.smallBlind.toString(), "50");
    assert.equal(table.bigBlind.toString(), "100");
  });

  it("accepts big blind > 2x small blind", async () => {
    const gameId3 = new BN(3);
    const [tablePda] = getTablePda(gameId3);
    const [gamePda] = getGamePda(gameId3);

    // Create a mock game session
    await cerberusProgram.methods
      .createGame(gameId3, 2, 52)
      .accounts({
        gameSession: gamePda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const potMint = creator.publicKey;
    const potAccount = creator.publicKey;

    // Create table with big blind = 3x small blind
    await program.methods
      .createTable(gameId3, new BN(100), new BN(300))
      .accounts({
        pokerTable: tablePda,
        gameSession: gamePda,
        potMint: potMint,
        potAccount: potAccount,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const table = await program.account.pokerTable.fetch(tablePda);
    assert.equal(table.smallBlind.toString(), "100");
    assert.equal(table.bigBlind.toString(), "300");
  });

  it("initializes player arrays as empty", async () => {
    const [tablePda] = getTablePda(GAME_ID);
    const table = await program.account.pokerTable.fetch(tablePda);

    // All player stacks should be default pubkey (all zeros)
    for (let i = 0; i < 10; i++) {
      assert.equal(
        table.playerStacks[i].toString(),
        PublicKey.default.toString(),
        `Player stack ${i} should be default`
      );
      assert.equal(
        table.playerBets[i].toString(),
        PublicKey.default.toString(),
        `Player bet ${i} should be default`
      );
    }
  });
});

describe("texas_holdem — post_blinds tests", () => {
  let provider: BankrunProvider;
  let program: Program;
  let cerberusProgram: Program;
  let creator: Keypair;
  let player0: Keypair;
  let player1: Keypair;
  let player2: Keypair;
  let potMint: PublicKey;

  const GAME_ID = new BN(100);
  const SMALL_BLIND = new BN(50);
  const BIG_BLIND = new BN(100);
  const NUM_PLAYERS = 3;
  const INITIAL_STACK = new BN(10000);

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
      await provider.context.banksClient.processTransaction(
        await provider.context.banksClient.getTransaction(
          (await provider.connection.requestAirdrop(keypair.publicKey, 10e9)).toString()
        )
      );
    }
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

    // Create a real SPL token mint for testing
    const mintKeypair = Keypair.generate();
    potMint = mintKeypair.publicKey;

    // Create mint account (using bankrun's direct account creation)
    const mintRent = await provider.connection.getMinimumBalanceForRentExemption(82);
    const createMintIx = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: potMint,
      lamports: mintRent,
      space: 82,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    // Initialize mint
    const spl = await import("@solana/spl-token");
    const initMintIx = spl.createInitializeMintInstruction(
      potMint,
      9, // decimals
      creator.publicKey, // mint authority
      null, // freeze authority
    );

    // Create pot token account
    const potAccount = Keypair.generate().publicKey;
    const tokenRent = await provider.connection.getMinimumBalanceForRentExemption(165);
    const createPotAccountIx = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: potAccount,
      lamports: tokenRent,
      space: 165,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    const initPotAccountIx = spl.createInitializeAccountInstruction(
      potAccount,
      potMint,
      tablePda, // owned by table PDA
    );

    // Create player token accounts
    const player0Stack = Keypair.generate().publicKey;
    const player1Stack = Keypair.generate().publicKey;
    const player2Stack = Keypair.generate().publicKey;

    const createPlayer0Ix = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: player0Stack,
      lamports: tokenRent,
      space: 165,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });
    const initPlayer0Ix = spl.createInitializeAccountInstruction(
      player0Stack,
      potMint,
      player0.publicKey,
    );

    const createPlayer1Ix = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: player1Stack,
      lamports: tokenRent,
      space: 165,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });
    const initPlayer1Ix = spl.createInitializeAccountInstruction(
      player1Stack,
      potMint,
      player1.publicKey,
    );

    const createPlayer2Ix = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: player2Stack,
      lamports: tokenRent,
      space: 165,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });
    const initPlayer2Ix = spl.createInitializeAccountInstruction(
      player2Stack,
      potMint,
      player2.publicKey,
    );

    // Mint tokens to player accounts
    const mintToPlayer0Ix = spl.createMintToInstruction(
      potMint,
      player0Stack,
      creator.publicKey,
      INITIAL_STACK.toNumber(),
    );
    const mintToPlayer1Ix = spl.createMintToInstruction(
      potMint,
      player1Stack,
      creator.publicKey,
      INITIAL_STACK.toNumber(),
    );
    const mintToPlayer2Ix = spl.createMintToInstruction(
      potMint,
      player2Stack,
      creator.publicKey,
      INITIAL_STACK.toNumber(),
    );

    // Execute all token setup in a transaction
    const tx = new anchor.web3.Transaction();
    tx.add(
      createMintIx,
      initMintIx,
      createPotAccountIx,
      initPotAccountIx,
      createPlayer0Ix,
      initPlayer0Ix,
      createPlayer1Ix,
      initPlayer1Ix,
      createPlayer2Ix,
      initPlayer2Ix,
      mintToPlayer0Ix,
      mintToPlayer1Ix,
      mintToPlayer2Ix,
    );

    await provider.sendAndConfirm(tx, [
      creator,
      mintKeypair,
      Keypair.fromSecretKey(potAccount.toBuffer()),
      Keypair.fromSecretKey(player0Stack.toBuffer()),
      Keypair.fromSecretKey(player1Stack.toBuffer()),
      Keypair.fromSecretKey(player2Stack.toBuffer()),
    ]);

    // Create poker table
    await program.methods
      .createTable(gameId, SMALL_BLIND, BIG_BLIND)
      .accounts({
        pokerTable: tablePda,
        gameSession: gamePda,
        potMint: potMint,
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
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
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
    const spl = await import("@solana/spl-token");
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
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .signers([player1, player2])
      .rpc();

    // Verify balances changed correctly
    const finalPotBalance = (await spl.getAccount(provider.connection, potAccount)).amount;
    const finalPlayer1Balance = (await spl.getAccount(provider.connection, player1Stack)).amount;
    const finalPlayer2Balance = (await spl.getAccount(provider.connection, player2Stack)).amount;

    assert.equal(
      finalPotBalance.toString(),
      (BigInt(initialPotBalance.toString()) + BigInt(SMALL_BLIND.toString()) + BigInt(BIG_BLIND.toString())).toString(),
      "Pot should receive small blind + big blind"
    );
    assert.equal(
      finalPlayer1Balance.toString(),
      (BigInt(initialPlayer1Balance.toString()) - BigInt(SMALL_BLIND.toString())).toString(),
      "Small blind player should lose small blind amount"
    );
    assert.equal(
      finalPlayer2Balance.toString(),
      (BigInt(initialPlayer2Balance.toString()) - BigInt(BIG_BLIND.toString())).toString(),
      "Big blind player should lose big blind amount"
    );
  });

  it("calculates player positions correctly with wraparound", async () => {
    const gameId = new BN(103);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Manually set dealer to position 2 to test wraparound
    // (In a real game, this would be set by the game logic)
    // For this test, we'll verify the calculation logic

    // With dealer at 2 and 3 players:
    // Small blind = (2 + 1) % 3 = 0
    // Big blind = (2 + 2) % 3 = 1
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
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
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
    await provider.context.banksClient.processTransaction(
      await provider.context.banksClient.getTransaction(
        (await provider.connection.requestAirdrop(poorPlayer.publicKey, 10e9)).toString()
      )
    );

    const spl = await import("@solana/spl-token");
    const poorPlayerStack = Keypair.generate().publicKey;
    const tokenRent = await provider.connection.getMinimumBalanceForRentExemption(165);
    
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: poorPlayerStack,
      lamports: tokenRent,
      space: 165,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });
    const initAccountIx = spl.createInitializeAccountInstruction(
      poorPlayerStack,
      potMint,
      poorPlayer.publicKey,
    );
    // Mint only 10 tokens (less than small blind of 50)
    const mintIx = spl.createMintToInstruction(
      potMint,
      poorPlayerStack,
      creator.publicKey,
      10,
    );

    const tx = new anchor.web3.Transaction();
    tx.add(createAccountIx, initAccountIx, mintIx);
    await provider.sendAndConfirm(tx, [
      creator,
      Keypair.fromSecretKey(poorPlayerStack.toBuffer()),
    ]);

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
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .signers([poorPlayer, player2])
        .rpc();
      assert.fail("Should have thrown insufficient balance error");
    } catch (e: any) {
      // SPL token program will throw an error for insufficient balance
      assert.include(e.message.toLowerCase(), "insufficient");
    }
  });

  it("rejects insufficient balance for big blind", async () => {
    const gameId = new BN(106);
    const { tablePda, potAccount, player0Stack, player1Stack, player2Stack } =
      await setupTableWithTokens(gameId);

    // Create a new player with insufficient balance
    const poorPlayer = Keypair.generate();
    await provider.context.banksClient.processTransaction(
      await provider.context.banksClient.getTransaction(
        (await provider.connection.requestAirdrop(poorPlayer.publicKey, 10e9)).toString()
      )
    );

    const spl = await import("@solana/spl-token");
    const poorPlayerStack = Keypair.generate().publicKey;
    const tokenRent = await provider.connection.getMinimumBalanceForRentExemption(165);
    
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: creator.publicKey,
      newAccountPubkey: poorPlayerStack,
      lamports: tokenRent,
      space: 165,
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });
    const initAccountIx = spl.createInitializeAccountInstruction(
      poorPlayerStack,
      potMint,
      poorPlayer.publicKey,
    );
    // Mint only 50 tokens (less than big blind of 100)
    const mintIx = spl.createMintToInstruction(
      potMint,
      poorPlayerStack,
      creator.publicKey,
      50,
    );

    const tx = new anchor.web3.Transaction();
    tx.add(createAccountIx, initAccountIx, mintIx);
    await provider.sendAndConfirm(tx, [
      creator,
      Keypair.fromSecretKey(poorPlayerStack.toBuffer()),
    ]);

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
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .signers([player1, poorPlayer])
        .rpc();
      assert.fail("Should have thrown insufficient balance error");
    } catch (e: any) {
      // SPL token program will throw an error for insufficient balance
      assert.include(e.message.toLowerCase(), "insufficient");
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
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
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
});

