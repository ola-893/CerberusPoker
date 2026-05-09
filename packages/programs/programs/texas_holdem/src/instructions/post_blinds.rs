use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::PokerTable;
use crate::errors::TexasHoldemError;

/// Posts small and big blinds as SPL token transfers to the pot escrow
///
/// This instruction handles the mandatory blind bets at the start of each hand.
/// The small blind (dealer+1) and big blind (dealer+2) players must transfer
/// their blind amounts to the pot account before the hand can begin.
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `num_players` - Total number of players at the table (used to calculate positions)
///
/// # Errors
/// * `BlindsAlreadyPosted` - If blinds have already been posted for this hand
/// * `InvalidStackAccount` - If player stack accounts don't match expected addresses
/// * `InsufficientBalance` - If a player doesn't have enough tokens for their blind
pub fn handler(ctx: Context<PostBlinds>, _game_id: u64, num_players: u8) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;

    require!(
        table.num_players == 0 && table.pot_total == 0,
        TexasHoldemError::BlindsAlreadyPosted
    );
    
    // Validate minimum players
    require!(num_players >= 2, TexasHoldemError::NotEnoughPlayers);
    require!(num_players <= 6, TexasHoldemError::TableFull);
    require!(
        ctx.accounts.small_blind_stack.owner == ctx.accounts.small_blind_player.key(),
        TexasHoldemError::InvalidStackAccount
    );
    require!(
        ctx.accounts.big_blind_stack.owner == ctx.accounts.big_blind_player.key(),
        TexasHoldemError::InvalidStackAccount
    );
    
    // Calculate player positions based on dealer index
    // In Texas Hold'em:
    // - Small blind is the player immediately left of the dealer (dealer_index + 1)
    // - Big blind is two positions left of the dealer (dealer_index + 2)
    let small_blind_index = (table.dealer_index + 1) % num_players;
    let big_blind_index = (table.dealer_index + 2) % num_players;
    
    let small_blind_amount = table.small_blind;
    let big_blind_amount = table.big_blind;
    let table_key = table.key();
    
    // Transfer small blind amount from small blind player to pot
    let small_blind_transfer = Transfer {
        from: ctx.accounts.small_blind_stack.to_account_info(),
        to: ctx.accounts.pot_account.to_account_info(),
        authority: ctx.accounts.small_blind_player.to_account_info(),
    };
    
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            small_blind_transfer,
        ),
        small_blind_amount,
    )?;
    
    // Transfer big blind amount from big blind player to pot
    let big_blind_transfer = Transfer {
        from: ctx.accounts.big_blind_stack.to_account_info(),
        to: ctx.accounts.pot_account.to_account_info(),
        authority: ctx.accounts.big_blind_player.to_account_info(),
    };
    
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            big_blind_transfer,
        ),
        big_blind_amount,
    )?;
    
    // Update player stack references in table state
    table.player_stacks[small_blind_index as usize] = ctx.accounts.small_blind_stack.key();
    table.player_stacks[big_blind_index as usize] = ctx.accounts.big_blind_stack.key();
    table.player_round_bets[small_blind_index as usize] = small_blind_amount;
    table.player_round_bets[big_blind_index as usize] = big_blind_amount;
    table.pot_total = small_blind_amount
        .checked_add(big_blind_amount)
        .ok_or(TexasHoldemError::Overflow)?;
    table.num_players = num_players;
    table.acted_bitmap = 0;
    table.last_raise = big_blind_amount;
    
    // Set current player to the position after big blind (first to act pre-flop)
    table.current_player = (big_blind_index + 1) % num_players;
    
    // Current bet is set to big blind amount (players must call this to stay in)
    table.current_bet = big_blind_amount;
    
    msg!(
        "Blinds posted for table {} — SB: {} (player {}), BB: {} (player {})",
        table_key,
        small_blind_amount,
        small_blind_index,
        big_blind_amount,
        big_blind_index
    );
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64, num_players: u8)]
pub struct PostBlinds<'info> {
    /// The PokerTable PDA being updated
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,
    
    /// Small blind player's wallet (must sign the transaction)
    pub small_blind_player: Signer<'info>,
    
    /// Small blind player's token account (their stack)
    #[account(mut)]
    pub small_blind_stack: Account<'info, TokenAccount>,
    
    /// Big blind player's wallet (must sign the transaction)
    pub big_blind_player: Signer<'info>,
    
    /// Big blind player's token account (their stack)
    #[account(mut)]
    pub big_blind_stack: Account<'info, TokenAccount>,
    
    /// The pot token account (receives blind transfers)
    #[account(
        mut,
        address = poker_table.escrow_account,
    )]
    pub pot_account: Account<'info, TokenAccount>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}
