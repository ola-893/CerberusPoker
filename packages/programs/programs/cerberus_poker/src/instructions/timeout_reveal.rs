use anchor_lang::prelude::*;
use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState};

pub fn handler(ctx: Context<TimeoutReveal>, _game_id: u64) -> Result<()> {
    let game = &mut ctx.accounts.game_session;
    let clock = Clock::get()?;

    require!(
        game.state == GameState::Deal || game.state == GameState::Active,
        CerberusPokerError::InvalidGameState
    );
    require!(game.reveal_deadline > 0, CerberusPokerError::NoDeadlineSet);
    require!(
        clock.unix_timestamp > game.reveal_deadline,
        CerberusPokerError::TimeoutNotReached
    );

    game.state = GameState::Complete;
    msg!("Reveal timeout triggered for game {}", game.game_id);
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct TimeoutReveal<'info> {
    /// CHECK: instructions_sysvar, checked by arcium program.
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    pub game_session: Account<'info, GameSession>,

    pub caller: Signer<'info>,
}
