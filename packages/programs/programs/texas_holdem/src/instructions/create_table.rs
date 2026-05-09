use anchor_lang::prelude::*;
use crate::state::{PokerTable, PokerPhase};
use crate::errors::TexasHoldemError;

/// Initializes a PokerTable PDA with specified blind levels and links it to a GameSession
///
/// This instruction creates the table state that manages betting rounds, pot, and player actions
/// for a Texas Hold'em game. The table is linked to a GameSession from the cerberus_poker program
/// which handles the underlying card operations (shuffle, deal, reveal).
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `small_blind` - Small blind amount in lamports/tokens
/// * `big_blind` - Big blind amount (must be at least 2x small blind)
///
/// # Errors
/// * `InvalidBlindAmounts` - If big blind is less than 2x small blind
pub fn handler(
    ctx: Context<CreateTable>,
    game_id: u64,
    small_blind: u64,
    big_blind: u64,
) -> Result<()> {
    // Validate blind amounts: big blind must be at least 2x small blind
    require!(
        big_blind >= small_blind.checked_mul(2).ok_or(TexasHoldemError::Overflow)?,
        TexasHoldemError::InvalidBlindAmounts
    );

    let table = &mut ctx.accounts.poker_table;
    
    // Link to the GameSession from cerberus_poker program
    table.game_session = ctx.accounts.game_session.key();
    
    // Initialize phase to PreFlop (game starts here after blinds are posted)
    table.phase = PokerPhase::PreFlop;
    
    // Dealer position starts at 0 (first player)
    table.dealer_index = 0;
    
    // Current player starts at 0 (will be set properly when blinds are posted)
    table.current_player = 0;
    
    // Store pot mint and account references (C-SPL token accounts)
    table.pot_mint = ctx.accounts.pot_mint.key();
    table.pot_account = ctx.accounts.pot_account.key();
    
    // Store escrow account reference (USDC+ escrow PDA for Phase 1)
    table.escrow_account = ctx.accounts.escrow_account.key();
    
    // Initialize player stack and bet account arrays (empty at creation)
    table.player_stacks = [Pubkey::default(); 10];
    table.player_bets = [Pubkey::default(); 10];
    
    // Set initial current bet to big blind (for pre-flop betting)
    table.current_bet = big_blind;
    
    // Initialize bitmaps (no players folded, all-in, or verified yet)
    table.folded_bitmap = 0;
    table.all_in_bitmap = 0;
    table.hand_verified_bitmap = 0;
    
    // Store blind levels
    table.small_blind = small_blind;
    table.big_blind = big_blind;
    
    // Initialize hand counter
    table.hand_number = 0;
    
    // Initialize last action time to current time
    let clock = Clock::get()?;
    table.last_action_time = clock.unix_timestamp;

    table.num_players = 0;
    table.acted_bitmap = 0;
    table.winners_bitmap = 0;
    table.winner_count = 0;
    table.last_raise = big_blind;
    table.pot_total = 0;
    table.player_round_bets = [0u64; 10];
    
    // Store PDA bump seed for future verification
    table.bump = ctx.bumps.poker_table;

    msg!("PokerTable created for game {} with blinds {}/{}", game_id, small_blind, big_blind);
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateTable<'info> {
    /// The PokerTable PDA being initialized
    /// Seeded by [b"table", game_id] to ensure one table per game
    #[account(
        init,
        payer = creator,
        space = PokerTable::SPACE,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub poker_table: Account<'info, PokerTable>,

    /// The GameSession PDA from cerberus_poker program
    /// This links the table to the underlying card game state
    /// CHECK: Validated by cerberus_poker program; we only store the reference
    pub game_session: UncheckedAccount<'info>,

    /// The C-SPL token mint for this table's pot and player stacks
    /// CHECK: Will be validated when tokens are transferred; stored as reference
    pub pot_mint: UncheckedAccount<'info>,

    /// The encrypted pot balance account (C-SPL token account)
    /// CHECK: Will be validated during token operations; stored as reference
    pub pot_account: UncheckedAccount<'info>,

    /// The USDC+ escrow PDA (standard SPL token account for Phase 1)
    /// This holds all player deposits during the game
    /// At showdown, funds are released to the winner
    /// CHECK: Will be validated during token operations; stored as reference
    pub escrow_account: UncheckedAccount<'info>,

    /// The account paying for the table PDA creation
    #[account(mut)]
    pub creator: Signer<'info>,

    /// System program for PDA creation
    pub system_program: Program<'info, System>,
}
