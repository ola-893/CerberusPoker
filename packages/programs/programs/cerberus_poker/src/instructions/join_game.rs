use anchor_lang::prelude::*;
use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, PlayerJoined};

pub fn handler(ctx: Context<JoinGame>, game_id: u64) -> Result<()> {
    let game = &mut ctx.accounts.game_session;
    let player = ctx.accounts.player.key();

    // Must be in Lobby state
    require!(game.state == GameState::Lobby, CerberusPokerError::InvalidGameState);

    // Must not be full
    require!(
        game.num_players < game.max_players,
        CerberusPokerError::GameFull
    );

    // Must not already be registered
    for i in 0..game.num_players as usize {
        require!(game.players[i] != player, CerberusPokerError::PlayerAlreadyJoined);
    }

    let player_index = game.num_players;
    game.players[player_index as usize] = player;
    game.num_players += 1;

    emit!(PlayerJoined {
        game_id,
        player,
        player_index,
    });

    msg!(
        "Player {} joined game {} as player {}",
        player,
        game_id,
        player_index
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    pub game_session: Account<'info, GameSession>,

    #[account(mut)]
    pub player: Signer<'info>,
}
