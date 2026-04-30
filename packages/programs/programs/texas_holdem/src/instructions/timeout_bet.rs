use anchor_lang::prelude::*;
use crate::state::PokerTable;
use crate::errors::TexasHoldemError;

pub fn handler(ctx: Context<TimeoutBet>, _game_id: u64) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    let clock = Clock::get()?;
    // Full timeout logic in task 13.5
    msg!("Bet timeout triggered at {}", clock.unix_timestamp);
    let player_index = table.current_player;
    table.folded_bitmap |= 1u16 << player_index;
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
