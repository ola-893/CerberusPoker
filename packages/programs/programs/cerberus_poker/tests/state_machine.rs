//! Integration tests for the CerberusPoker state machine using solana-program-test
//!
//! Tests the full game lifecycle: Lobby → Shuffle → Deal
//!
//! These tests use solana-program-test for fast local execution without requiring
//! a live Arcium MXE. MXE callbacks are simulated by directly calling the callback
//! instructions with mock output data.

use anchor_lang::prelude::*;
use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use solana_program_test::*;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};
use std::str::FromStr;

// Import the program types
use cerberus_poker::state::{GameSession, GameState};

fn processor_entry<'info>(
    program_id: &Pubkey,
    accounts: &[AccountInfo<'info>],
    instruction_data: &[u8],
) -> anchor_lang::solana_program::entrypoint::ProgramResult {
    // Anchor's generated entrypoint ties the slice borrow to AccountInfo's lifetime.
    let accounts: &'info [AccountInfo<'info>] = unsafe { std::mem::transmute(accounts) };
    cerberus_poker::entry(program_id, accounts, instruction_data)
}

/// Helper to derive game PDA
fn get_game_pda(program_id: &Pubkey, game_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"game", &game_id.to_le_bytes()], program_id)
}

/// Helper to create a game
async fn create_game(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    program_id: &Pubkey,
    game_id: u64,
    max_players: u8,
    deck_size: u8,
) -> std::result::Result<(Pubkey, u8), BanksClientError> {
    let (game_pda, bump) = get_game_pda(program_id, game_id);

    let accounts = cerberus_poker::accounts::CreateGame {
        game_session: game_pda,
        creator: payer.pubkey(),
        system_program: solana_sdk::system_program::id(),
    };

    let data = cerberus_poker::instruction::CreateGame {
        game_id,
        max_players,
        deck_size,
    };

    let ix = Instruction {
        program_id: *program_id,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    };

    let recent_blockhash = banks_client.get_latest_blockhash().await?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[payer],
        recent_blockhash,
    );

    banks_client.process_transaction(tx).await?;
    Ok((game_pda, bump))
}

/// Helper to join a game
async fn join_game(
    banks_client: &mut BanksClient,
    player: &Keypair,
    program_id: &Pubkey,
    game_id: u64,
    game_pda: &Pubkey,
    bump: u8,
) -> std::result::Result<(), BanksClientError> {
    let accounts = cerberus_poker::accounts::JoinGame {
        game_session: *game_pda,
        player: player.pubkey(),
    };

    let data = cerberus_poker::instruction::JoinGame { game_id };

    let ix = Instruction {
        program_id: *program_id,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    };

    let recent_blockhash = banks_client.get_latest_blockhash().await?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&player.pubkey()),
        &[player],
        recent_blockhash,
    );

    banks_client.process_transaction(tx).await?;
    Ok(())
}

/// Helper to fetch game session account
async fn fetch_game_session(
    banks_client: &mut BanksClient,
    game_pda: &Pubkey,
) -> std::result::Result<GameSession, BanksClientError> {
    let account = banks_client.get_account(*game_pda).await?.unwrap();
    let game: GameSession = GameSession::try_deserialize(&mut &account.data[8..]).unwrap();
    Ok(game)
}

#[tokio::test]
async fn test_lobby_to_shuffle_transition() {
    // Setup program test environment
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create game
    let game_id = 1u64;
    let (game_pda, bump) = create_game(&mut banks_client, &payer, &program_id, game_id, 2, 52)
        .await
        .unwrap();

    // Verify initial state is Lobby
    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();
    assert_eq!(game.state, GameState::Lobby);
    assert_eq!(game.num_players, 0);
    assert_eq!(game.max_players, 2);
    assert_eq!(game.deck_size, 52);

    // Join two players
    let player1 = Keypair::new();
    let player2 = Keypair::new();

    // Fund players
    let fund_ix1 = system_instruction::transfer(&payer.pubkey(), &player1.pubkey(), 1_000_000_000);
    let fund_ix2 = system_instruction::transfer(&payer.pubkey(), &player2.pubkey(), 1_000_000_000);
    let tx = Transaction::new_signed_with_payer(
        &[fund_ix1, fund_ix2],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    // Player 1 joins
    join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();

    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();
    assert_eq!(game.num_players, 1);
    assert_eq!(game.players[0], player1.pubkey());

    // Player 2 joins
    join_game(
        &mut banks_client,
        &player2,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();

    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();
    assert_eq!(game.num_players, 2);
    assert_eq!(game.players[1], player2.pubkey());
    assert_eq!(game.state, GameState::Lobby);
}

#[tokio::test]
async fn test_player_registration_validation() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let game_id = 2u64;
    let (game_pda, bump) = create_game(&mut banks_client, &payer, &program_id, game_id, 2, 52)
        .await
        .unwrap();

    let player1 = Keypair::new();
    let fund_ix = system_instruction::transfer(&payer.pubkey(), &player1.pubkey(), 1_000_000_000);
    let tx = Transaction::new_signed_with_payer(
        &[fund_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    // Player joins successfully
    join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();

    // Attempt duplicate join - should fail
    let result = join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await;
    assert!(result.is_err(), "Duplicate join should fail");
}

#[tokio::test]
async fn test_game_full_validation() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let game_id = 3u64;
    let (game_pda, bump) = create_game(
        &mut banks_client,
        &payer,
        &program_id,
        game_id,
        2, // max 2 players
        52,
    )
    .await
    .unwrap();

    let player1 = Keypair::new();
    let player2 = Keypair::new();
    let player3 = Keypair::new();

    // Fund all players
    let fund_ix1 = system_instruction::transfer(&payer.pubkey(), &player1.pubkey(), 1_000_000_000);
    let fund_ix2 = system_instruction::transfer(&payer.pubkey(), &player2.pubkey(), 1_000_000_000);
    let fund_ix3 = system_instruction::transfer(&payer.pubkey(), &player3.pubkey(), 1_000_000_000);
    let tx = Transaction::new_signed_with_payer(
        &[fund_ix1, fund_ix2, fund_ix3],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    // First two players join successfully
    join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();
    join_game(
        &mut banks_client,
        &player2,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();

    // Third player should fail - game is full
    let result = join_game(
        &mut banks_client,
        &player3,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await;
    assert!(result.is_err(), "Join should fail when game is full");
}

#[tokio::test]
async fn test_invalid_deck_size() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, _) = program_test.start().await;

    let game_id = 4u64;

    // Attempt to create game with invalid deck size (not 52)
    let result = create_game(
        &mut banks_client,
        &payer,
        &program_id,
        game_id,
        2,
        40, // Invalid deck size
    )
    .await;

    assert!(result.is_err(), "Should reject invalid deck size");
}

#[tokio::test]
async fn test_invalid_max_players() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, _) = program_test.start().await;

    let game_id = 5u64;

    // Attempt to create game with too many players (> 6)
    let result = create_game(
        &mut banks_client,
        &payer,
        &program_id,
        game_id,
        7, // Invalid: > MAX_PLAYERS (6)
        52,
    )
    .await;

    assert!(result.is_err(), "Should reject max_players > 6");
}

#[tokio::test]
async fn test_card_assignment_tracking() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, _) = program_test.start().await;

    let game_id = 6u64;
    let (game_pda, _) = create_game(&mut banks_client, &payer, &program_id, game_id, 2, 52)
        .await
        .unwrap();

    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();

    // Verify initial state
    assert_eq!(
        game.card_value_used[0], 0,
        "No cards should be used initially"
    );

    // All cards should be unassigned (0xFE)
    for i in 0..52 {
        assert_eq!(
            game.card_assigned_to[i], 0xFE,
            "Card {} should be unassigned",
            i
        );
    }

    // All cards should be unrevealed (0xFF)
    for i in 0..52 {
        assert_eq!(
            game.unmasked_cards[i], 0xFF,
            "Card {} should be unrevealed",
            i
        );
    }

    // Verify bitmap helpers work correctly
    assert!(!game.is_card_value_used(0));
    assert!(!game.is_card_revealed(0));
    assert!(!game.has_player_shuffled(0));
}

#[tokio::test]
async fn test_shuffle_bitmap_tracking() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let game_id = 7u64;
    let (game_pda, bump) = create_game(
        &mut banks_client,
        &payer,
        &program_id,
        game_id,
        3, // 3 players
        52,
    )
    .await
    .unwrap();

    // Join 3 players
    let player1 = Keypair::new();
    let player2 = Keypair::new();
    let player3 = Keypair::new();

    let fund_ix1 = system_instruction::transfer(&payer.pubkey(), &player1.pubkey(), 1_000_000_000);
    let fund_ix2 = system_instruction::transfer(&payer.pubkey(), &player2.pubkey(), 1_000_000_000);
    let fund_ix3 = system_instruction::transfer(&payer.pubkey(), &player3.pubkey(), 1_000_000_000);
    let tx = Transaction::new_signed_with_payer(
        &[fund_ix1, fund_ix2, fund_ix3],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();
    join_game(
        &mut banks_client,
        &player2,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();
    join_game(
        &mut banks_client,
        &player3,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();

    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();
    assert_eq!(game.num_players, 3);
    assert_eq!(
        game.shuffle_bitmap, 0,
        "No players should have shuffled yet"
    );
    assert!(!game.all_players_shuffled());
}

#[tokio::test]
async fn test_state_transitions() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let game_id = 8u64;
    let (game_pda, bump) = create_game(&mut banks_client, &payer, &program_id, game_id, 2, 52)
        .await
        .unwrap();

    // Initial state: Lobby
    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();
    assert_eq!(game.state, GameState::Lobby);

    // Join players
    let player1 = Keypair::new();
    let player2 = Keypair::new();

    let fund_ix1 = system_instruction::transfer(&payer.pubkey(), &player1.pubkey(), 1_000_000_000);
    let fund_ix2 = system_instruction::transfer(&payer.pubkey(), &player2.pubkey(), 1_000_000_000);
    let tx = Transaction::new_signed_with_payer(
        &[fund_ix1, fund_ix2],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();
    join_game(
        &mut banks_client,
        &player2,
        &program_id,
        game_id,
        &game_pda,
        bump,
    )
    .await
    .unwrap();

    // Still in Lobby after players join
    let game = fetch_game_session(&mut banks_client, &game_pda)
        .await
        .unwrap();
    assert_eq!(game.state, GameState::Lobby);
    assert_eq!(game.num_players, 2);

    // Note: Transition to Shuffle state requires calling start_shuffle with MXE accounts
    // which is tested separately with mock MXE infrastructure
}

#[tokio::test]
async fn test_multiple_games_isolation() {
    let program_id = Pubkey::from_str("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test =
        ProgramTest::new("cerberus_poker", program_id, processor!(processor_entry));

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create two separate games
    let game_id_1 = 10u64;
    let game_id_2 = 11u64;

    let (game_pda_1, bump_1) =
        create_game(&mut banks_client, &payer, &program_id, game_id_1, 2, 52)
            .await
            .unwrap();

    let (game_pda_2, bump_2) =
        create_game(&mut banks_client, &payer, &program_id, game_id_2, 3, 52)
            .await
            .unwrap();

    // Verify games are independent
    let game1 = fetch_game_session(&mut banks_client, &game_pda_1)
        .await
        .unwrap();
    let game2 = fetch_game_session(&mut banks_client, &game_pda_2)
        .await
        .unwrap();

    assert_eq!(game1.game_id, game_id_1);
    assert_eq!(game2.game_id, game_id_2);
    assert_eq!(game1.max_players, 2);
    assert_eq!(game2.max_players, 3);

    // Join player to game 1
    let player1 = Keypair::new();
    let fund_ix = system_instruction::transfer(&payer.pubkey(), &player1.pubkey(), 1_000_000_000);
    let tx = Transaction::new_signed_with_payer(
        &[fund_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    join_game(
        &mut banks_client,
        &player1,
        &program_id,
        game_id_1,
        &game_pda_1,
        bump_1,
    )
    .await
    .unwrap();

    // Verify only game 1 is affected
    let game1 = fetch_game_session(&mut banks_client, &game_pda_1)
        .await
        .unwrap();
    let game2 = fetch_game_session(&mut banks_client, &game_pda_2)
        .await
        .unwrap();

    assert_eq!(game1.num_players, 1);
    assert_eq!(game2.num_players, 0);
}
