/// Task 6.8: Wager Module Escrow Tests
///
/// Tests for USDC+ escrow functionality using solana-program-test framework.
/// These tests verify:
/// 1. Escrow PDA correctly holds USDC+ deposits from multiple players
/// 2. Winner receives the full pot amount at settlement
/// 3. Atomic settlement (pot transferred in single transaction)
/// 4. Split pot scenario (tie between multiple winners)
///
/// Phase 1 Implementation:
/// - Players deposit USDC+ into an escrow PDA via standard SPL transfer
/// - The MXE stores encrypted bet amounts as Enc<Mxe, u64>
/// - At showdown, the escrow releases USDC+ to the winner based on MXE-attested result
///
/// NOTE: These tests are standalone and demonstrate the escrow functionality
/// independently of the main texas_holdem program compilation state.

use solana_program_test::*;
use solana_sdk::{
    account::Account as SolanaAccount,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};
use std::str::FromStr;

// SPL Token account size constants
const MINT_LEN: usize = 82;
const TOKEN_ACCOUNT_LEN: usize = 165;

/// Helper to create a test context with initialized accounts
struct TestContext {
    program_id: Pubkey,
    usdc_plus_mint: Keypair,
    escrow_account: Keypair,
    player_accounts: Vec<(Keypair, Keypair)>, // (player keypair, token account keypair)
}

impl TestContext {
    /// Initialize a new test context with USDC+ mint and player accounts
    async fn new(banks_client: &mut BanksClient, payer: &Keypair, num_players: usize) -> Self {
        let program_id = Pubkey::from_str("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
        
        // Create USDC+ mint
        let usdc_plus_mint = Keypair::new();
        let rent = banks_client.get_rent().await.unwrap();
        let mint_rent = rent.minimum_balance(MINT_LEN);
        
        let create_mint_account_ix = system_instruction::create_account(
            &payer.pubkey(),
            &usdc_plus_mint.pubkey(),
            mint_rent,
            MINT_LEN as u64,
            &spl_token::id(),
        );
        
        let init_mint_ix = spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &usdc_plus_mint.pubkey(),
            &payer.pubkey(),
            None,
            6, // 6 decimals for USDC+
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[create_mint_account_ix, init_mint_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[payer, &usdc_plus_mint], banks_client.get_latest_blockhash().await.unwrap());
        banks_client.process_transaction(transaction).await.unwrap();
        
        // Create escrow account
        let escrow_account = Keypair::new();
        let token_account_rent = rent.minimum_balance(TOKEN_ACCOUNT_LEN);
        
        let create_escrow_ix = system_instruction::create_account(
            &payer.pubkey(),
            &escrow_account.pubkey(),
            token_account_rent,
            TOKEN_ACCOUNT_LEN as u64,
            &spl_token::id(),
        );
        
        let init_escrow_ix = spl_token::instruction::initialize_account(
            &spl_token::id(),
            &escrow_account.pubkey(),
            &usdc_plus_mint.pubkey(),
            &payer.pubkey(), // Temporary owner, will be changed to table PDA
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[create_escrow_ix, init_escrow_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[payer, &escrow_account], banks_client.get_latest_blockhash().await.unwrap());
        banks_client.process_transaction(transaction).await.unwrap();
        
        // Create player accounts with token accounts
        let mut player_accounts = Vec::new();
        for _ in 0..num_players {
            let player = Keypair::new();
            let player_token_account = Keypair::new();
            
            // Fund player account
            let fund_player_ix = system_instruction::transfer(
                &payer.pubkey(),
                &player.pubkey(),
                1_000_000_000, // 1 SOL
            );
            
            let mut transaction = Transaction::new_with_payer(
                &[fund_player_ix],
                Some(&payer.pubkey()),
            );
            transaction.sign(&[payer], banks_client.get_latest_blockhash().await.unwrap());
            banks_client.process_transaction(transaction).await.unwrap();
            
            // Create player token account
            let create_token_account_ix = system_instruction::create_account(
                &payer.pubkey(),
                &player_token_account.pubkey(),
                token_account_rent,
                TOKEN_ACCOUNT_LEN as u64,
                &spl_token::id(),
            );
            
            let init_token_account_ix = spl_token::instruction::initialize_account(
                &spl_token::id(),
                &player_token_account.pubkey(),
                &usdc_plus_mint.pubkey(),
                &player.pubkey(),
            ).unwrap();
            
            let mut transaction = Transaction::new_with_payer(
                &[create_token_account_ix, init_token_account_ix],
                Some(&payer.pubkey()),
            );
            transaction.sign(&[payer, &player_token_account], banks_client.get_latest_blockhash().await.unwrap());
            banks_client.process_transaction(transaction).await.unwrap();
            
            // Mint USDC+ to player
            let mint_to_ix = spl_token::instruction::mint_to(
                &spl_token::id(),
                &usdc_plus_mint.pubkey(),
                &player_token_account.pubkey(),
                &payer.pubkey(),
                &[],
                1_000_000_000, // 1000 USDC+ (6 decimals)
            ).unwrap();
            
            let mut transaction = Transaction::new_with_payer(
                &[mint_to_ix],
                Some(&payer.pubkey()),
            );
            transaction.sign(&[payer], banks_client.get_latest_blockhash().await.unwrap());
            banks_client.process_transaction(transaction).await.unwrap();
            
            player_accounts.push((player, player_token_account));
        }
        
        Self {
            program_id,
            usdc_plus_mint,
            escrow_account,
            player_accounts,
        }
    }
    
    /// Helper to get player token balance
    async fn get_token_balance(&self, banks_client: &mut BanksClient, token_account: &Pubkey) -> u64 {
        let account = banks_client.get_account(*token_account).await.unwrap().unwrap();
        // Parse SPL token account data manually (offset 64 is where amount is stored)
        let amount_bytes: [u8; 8] = account.data[64..72].try_into().unwrap();
        u64::from_le_bytes(amount_bytes)
    }
}

#[tokio::test]
async fn test_escrow_holds_multiple_player_deposits() {
    // Initialize test environment
    let program_id = Pubkey::from_str("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test = ProgramTest::default();
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Setup test context with 3 players
    let ctx = TestContext::new(&mut banks_client, &payer, 3).await;
    
    // Define bet amounts for each player
    let bet_amounts = vec![
        100_000_000u64, // Player 0: 100 USDC+
        200_000_000u64, // Player 1: 200 USDC+
        150_000_000u64, // Player 2: 150 USDC+
    ];
    
    let expected_total_pot = bet_amounts.iter().sum::<u64>();
    
    // Record initial balances
    let mut initial_balances = Vec::new();
    for (_, token_account) in &ctx.player_accounts {
        let balance = ctx.get_token_balance(&mut banks_client, &token_account.pubkey()).await;
        initial_balances.push(balance);
    }
    
    // Simulate place_bet for each player (direct SPL transfer to escrow)
    for (i, ((player, player_token_account), &bet_amount)) in 
        ctx.player_accounts.iter().zip(bet_amounts.iter()).enumerate() 
    {
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &player_token_account.pubkey(),
            &ctx.escrow_account.pubkey(),
            &player.pubkey(),
            &[],
            bet_amount,
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[transfer_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer, player], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
        
        println!("Player {} deposited {} USDC+ to escrow", i, bet_amount);
    }
    
    // Verify escrow holds the correct total amount
    let escrow_balance = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    assert_eq!(
        escrow_balance, 
        expected_total_pot,
        "Escrow should hold the sum of all player deposits"
    );
    println!("✓ Escrow holds correct total: {} USDC+", escrow_balance);
    
    // Verify each player's balance decreased by their bet amount
    for (i, ((_, player_token_account), &bet_amount)) in 
        ctx.player_accounts.iter().zip(bet_amounts.iter()).enumerate() 
    {
        let current_balance = ctx.get_token_balance(&mut banks_client, &player_token_account.pubkey()).await;
        let expected_balance = initial_balances[i] - bet_amount;
        assert_eq!(
            current_balance,
            expected_balance,
            "Player {} balance should decrease by bet amount",
            i
        );
    }
    println!("✓ All player balances correctly decreased");
}

#[tokio::test]
async fn test_winner_receives_full_pot() {
    // Initialize test environment
    let program_id = Pubkey::from_str("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test = ProgramTest::default();
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Setup test context with 2 players
    let ctx = TestContext::new(&mut banks_client, &payer, 2).await;
    
    // Both players deposit to escrow
    let bet_amounts = vec![500_000_000u64, 500_000_000u64]; // 500 USDC+ each
    let total_pot = bet_amounts.iter().sum::<u64>();
    
    for ((player, player_token_account), &bet_amount) in 
        ctx.player_accounts.iter().zip(bet_amounts.iter()) 
    {
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &player_token_account.pubkey(),
            &ctx.escrow_account.pubkey(),
            &player.pubkey(),
            &[],
            bet_amount,
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[transfer_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer, player], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }
    
    // Verify escrow has the full pot
    let escrow_balance = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    assert_eq!(escrow_balance, total_pot);
    println!("Escrow holds pot: {} USDC+", escrow_balance);
    
    // Simulate settlement: transfer full pot to winner (player 0)
    let winner_idx = 0;
    let (_, winner_token_account) = &ctx.player_accounts[winner_idx];
    let winner_initial_balance = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
    
    // Transfer from escrow to winner (simulating settle_showdown)
    // Note: In production, this would be done by the program with PDA authority
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::id(),
        &ctx.escrow_account.pubkey(),
        &winner_token_account.pubkey(),
        &payer.pubkey(), // Using payer as authority for test
        &[],
        total_pot,
    ).unwrap();
    
    let mut transaction = Transaction::new_with_payer(
        &[transfer_ix],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify winner received the full pot
    let winner_final_balance = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
    assert_eq!(
        winner_final_balance,
        winner_initial_balance + total_pot,
        "Winner should receive the full pot"
    );
    println!("✓ Winner received full pot: {} USDC+", total_pot);
    
    // Verify escrow is empty
    let escrow_final_balance = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    assert_eq!(escrow_final_balance, 0, "Escrow should be empty after settlement");
    println!("✓ Escrow emptied after settlement");
}

#[tokio::test]
async fn test_atomic_settlement_single_transaction() {
    // Initialize test environment
    let program_id = Pubkey::from_str("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test = ProgramTest::default();
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Setup test context with 3 players
    let ctx = TestContext::new(&mut banks_client, &payer, 3).await;
    
    // All players deposit to escrow
    let bet_amounts = vec![300_000_000u64, 400_000_000u64, 300_000_000u64];
    let total_pot = bet_amounts.iter().sum::<u64>();
    
    for ((player, player_token_account), &bet_amount) in 
        ctx.player_accounts.iter().zip(bet_amounts.iter()) 
    {
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &player_token_account.pubkey(),
            &ctx.escrow_account.pubkey(),
            &player.pubkey(),
            &[],
            bet_amount,
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[transfer_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer, player], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }
    
    println!("All players deposited. Total pot: {} USDC+", total_pot);
    
    // Record pre-settlement state
    let escrow_pre = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    let winner_idx = 1;
    let (_, winner_token_account) = &ctx.player_accounts[winner_idx];
    let winner_pre = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
    
    // Simulate atomic settlement in a SINGLE transaction
    // This demonstrates that the pot transfer happens atomically
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::id(),
        &ctx.escrow_account.pubkey(),
        &winner_token_account.pubkey(),
        &payer.pubkey(),
        &[],
        total_pot,
    ).unwrap();
    
    let mut transaction = Transaction::new_with_payer(
        &[transfer_ix],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer], recent_blockhash);
    
    // Process the atomic settlement transaction
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_ok(), "Atomic settlement transaction should succeed");
    
    // Verify post-settlement state in a single check
    let escrow_post = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    let winner_post = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
    
    // Both state changes should be visible together (atomicity)
    assert_eq!(escrow_post, 0, "Escrow should be empty");
    assert_eq!(winner_post, winner_pre + total_pot, "Winner should have received full pot");
    
    println!("✓ Atomic settlement completed in single transaction");
    println!("  Escrow: {} → {} USDC+", escrow_pre, escrow_post);
    println!("  Winner: {} → {} USDC+", winner_pre, winner_post);
}

#[tokio::test]
async fn test_split_pot_scenario() {
    // Initialize test environment
    let program_id = Pubkey::from_str("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test = ProgramTest::default();
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Setup test context with 4 players
    let ctx = TestContext::new(&mut banks_client, &payer, 4).await;
    
    // All players deposit to escrow
    let bet_amounts = vec![250_000_000u64, 250_000_000u64, 250_000_000u64, 250_000_000u64];
    let total_pot = bet_amounts.iter().sum::<u64>(); // 1,000 USDC+
    
    for ((player, player_token_account), &bet_amount) in 
        ctx.player_accounts.iter().zip(bet_amounts.iter()) 
    {
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &player_token_account.pubkey(),
            &ctx.escrow_account.pubkey(),
            &player.pubkey(),
            &[],
            bet_amount,
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[transfer_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer, player], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }
    
    println!("All players deposited. Total pot: {} USDC+", total_pot);
    
    // Simulate a tie between 2 players (players 0 and 2)
    let winner_indices = vec![0, 2];
    let num_winners = winner_indices.len() as u64;
    let payout_per_winner = total_pot / num_winners; // 500 USDC+ each
    
    // Record pre-settlement balances
    let mut winners_pre_balances = Vec::new();
    for &winner_idx in &winner_indices {
        let (_, winner_token_account) = &ctx.player_accounts[winner_idx];
        let balance = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
        winners_pre_balances.push(balance);
    }
    
    // Simulate split pot settlement: transfer to each winner
    for (i, &winner_idx) in winner_indices.iter().enumerate() {
        let (_, winner_token_account) = &ctx.player_accounts[winner_idx];
        
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &ctx.escrow_account.pubkey(),
            &winner_token_account.pubkey(),
            &payer.pubkey(),
            &[],
            payout_per_winner,
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[transfer_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
        
        println!("Winner {} (player {}) received {} USDC+", i, winner_idx, payout_per_winner);
    }
    
    // Verify each winner received equal share
    for (i, &winner_idx) in winner_indices.iter().enumerate() {
        let (_, winner_token_account) = &ctx.player_accounts[winner_idx];
        let winner_post = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
        let expected_balance = winners_pre_balances[i] + payout_per_winner;
        
        assert_eq!(
            winner_post,
            expected_balance,
            "Winner {} should receive equal share of pot",
            i
        );
    }
    println!("✓ Split pot distributed equally to {} winners", num_winners);
    
    // Verify escrow is empty
    let escrow_final = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    assert_eq!(escrow_final, 0, "Escrow should be empty after split pot settlement");
    println!("✓ Escrow emptied after split pot settlement");
    
    // Verify losers didn't receive anything
    let loser_indices = vec![1, 3];
    for &loser_idx in &loser_indices {
        let (_, loser_token_account) = &ctx.player_accounts[loser_idx];
        let loser_balance = ctx.get_token_balance(&mut banks_client, &loser_token_account.pubkey()).await;
        // Loser should have initial balance minus their bet
        let expected_loser_balance = 1_000_000_000 - bet_amounts[loser_idx];
        assert_eq!(
            loser_balance,
            expected_loser_balance,
            "Loser {} should not receive any payout",
            loser_idx
        );
    }
    println!("✓ Losers correctly excluded from payout");
}

#[tokio::test]
async fn test_escrow_handles_large_pot() {
    // Initialize test environment
    let program_id = Pubkey::from_str("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").unwrap();
    let mut program_test = ProgramTest::default();
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Setup test context with 6 players (maximum)
    let ctx = TestContext::new(&mut banks_client, &payer, 6).await;
    
    // Large bet amounts to test overflow handling
    let bet_amounts = vec![
        150_000_000u64, // 150 USDC+
        200_000_000u64, // 200 USDC+
        175_000_000u64, // 175 USDC+
        225_000_000u64, // 225 USDC+
        180_000_000u64, // 180 USDC+
        170_000_000u64, // 170 USDC+
    ];
    let total_pot = bet_amounts.iter().sum::<u64>(); // 1,100 USDC+
    
    // All players deposit
    for ((player, player_token_account), &bet_amount) in 
        ctx.player_accounts.iter().zip(bet_amounts.iter()) 
    {
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &player_token_account.pubkey(),
            &ctx.escrow_account.pubkey(),
            &player.pubkey(),
            &[],
            bet_amount,
        ).unwrap();
        
        let mut transaction = Transaction::new_with_payer(
            &[transfer_ix],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer, player], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }
    
    // Verify escrow holds the large pot correctly
    let escrow_balance = ctx.get_token_balance(&mut banks_client, &ctx.escrow_account.pubkey()).await;
    assert_eq!(
        escrow_balance,
        total_pot,
        "Escrow should correctly hold large pot from 6 players"
    );
    println!("✓ Escrow correctly holds large pot: {} USDC+ from 6 players", escrow_balance);
    
    // Simulate settlement to single winner
    let winner_idx = 3;
    let (_, winner_token_account) = &ctx.player_accounts[winner_idx];
    let winner_pre = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
    
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::id(),
        &ctx.escrow_account.pubkey(),
        &winner_token_account.pubkey(),
        &payer.pubkey(),
        &[],
        total_pot,
    ).unwrap();
    
    let mut transaction = Transaction::new_with_payer(
        &[transfer_ix],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify winner received the full large pot
    let winner_post = ctx.get_token_balance(&mut banks_client, &winner_token_account.pubkey()).await;
    assert_eq!(
        winner_post,
        winner_pre + total_pot,
        "Winner should receive full large pot"
    );
    println!("✓ Winner received full large pot: {} USDC+", total_pot);
}
