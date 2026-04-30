use anchor_lang::prelude::*;
use crate::state::{PokerTable, PokerPhase};

pub fn handler(ctx: Context<AdvancePhase>, _game_id: u64) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    table.phase = match table.phase {
        PokerPhase::PreFlop => PokerPhase::Flop,
        PokerPhase::Flop => PokerPhase::Turn,
        PokerPhase::Turn => PokerPhase::River,
        PokerPhase::River => PokerPhase::Showdown,
        PokerPhase::Showdown => PokerPhase::Showdown,
    };
    msg!("Phase advanced");
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct AdvancePhase<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,
    pub caller: Signer<'info>,
}
