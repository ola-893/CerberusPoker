use anchor_lang::prelude::*;
use crate::state::PokerTable;

pub fn handler(_ctx: Context<Showdown>, _game_id: u64) -> Result<()> {
    // Full implementation in task 15
    msg!("Showdown — hand evaluation and pot settlement");
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct Showdown<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,
    pub caller: Signer<'info>,
}
