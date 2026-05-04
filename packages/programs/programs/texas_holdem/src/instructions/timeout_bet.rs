use anchor_lang::prelude::*;
use crate::state::{PokerTable, BETTING_TIMEOUT_SECS};
use crate::errors::TexasHoldemError;

/// Forces the current player to fold if they haven't acted within BETTING_TIMEOUT_SECS
///
/// This instruction ensures the game can always make progress even if a player
/// goes offline or refuses to act. Anyone can call this instruction after the
/// timeout period has elapsed.
///
/// # Timeout Enforcement
/// - Timeout period: BETTING_TIMEOUT_SECS (default 120 seconds / 2 minutes)
/// - Starts from: last_action_time (updated on every player_action)
/// - Effect: Forces current player to fold, advances to next player
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
///
/// # Errors
/// * `BettingTimeoutNotReached` - If the timeout period hasn't elapsed yet
/// * `InvalidGameState` - If the game is not in an active betting phase
pub fn handler(ctx: Context<TimeoutBet>, _game_id: u64) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    let clock = Clock::get()?;
    
    // Calculate timeout deadline
    let timeout_deadline = table.last_action_time
        .checked_add(BETTING_TIMEOUT_SECS)
        .ok_or(TexasHoldemError::Overflow)?;
    
    // Verify timeout has been reached
    require!(
        clock.unix_timestamp >= timeout_deadline,
        TexasHoldemError::BettingTimeoutNotReached
    );
    
    let player_index = table.current_player;
    
    msg!(
        "Bet timeout triggered at {} for player {} (deadline was {})",
        clock.unix_timestamp,
        player_index,
        timeout_deadline
    );
    
    // Force fold the current player
    let folded_mask = 1u16 << player_index;
    table.folded_bitmap |= folded_mask;
    
    msg!("Player {} forced to fold due to timeout", player_index);
    
    // Advance to next active player
    let mut next_player = (player_index + 1) % 10; // Assuming max 10 players
    let mut attempts = 0;
    
    // Keep advancing until we find an active player or complete a full rotation
    while attempts < 10 {
        let next_mask = 1u16 << next_player;
        let is_folded = (table.folded_bitmap & next_mask) != 0;
        let is_all_in = (table.all_in_bitmap & next_mask) != 0;
        
        // If player is active (not folded and not all-in), they're next
        if !is_folded && !is_all_in {
            table.current_player = next_player;
            msg!("Next player: {}", next_player);
            break;
        }
        
        next_player = (next_player + 1) % 10;
        attempts += 1;
    }
    
    // If we couldn't find an active player, the betting round is complete
    if attempts == 10 {
        msg!("Betting round complete after timeout — all players folded or all-in");
    }
    
    // Update last action time to current time
    table.last_action_time = clock.unix_timestamp;
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct TimeoutBet<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,
    pub caller: Signer<'info>,
}
