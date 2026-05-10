use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<TimeoutShuffle>, _game_id: u64) -> Result<()> {
    let game = &mut ctx.accounts.game_session;
    let clock = Clock::get()?;

    require!(
        game.state == GameState::Shuffle,
        CerberusPokerError::InvalidGameState
    );
    require!(game.shuffle_deadline > 0, CerberusPokerError::NoDeadlineSet);
    require!(
        clock.unix_timestamp > game.shuffle_deadline,
        CerberusPokerError::TimeoutNotReached
    );

    // Mark game as complete — shuffle stalled, game cannot proceed
    game.state = GameState::Complete;
    msg!("Shuffle timeout triggered for game {}", game.game_id);
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct TimeoutShuffle<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    pub game_session: Account<'info, GameSession>,

    pub caller: Signer<'info>,
}
