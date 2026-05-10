use crate::errors::CerberusPokerError;
use crate::state::{GameCreated, GameSession, GameState, DECK_SIZE, MAX_PLAYERS};
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<CreateGame>,
    game_id: u64,
    max_players: u8,
    deck_size: u8,
) -> Result<()> {
    require!(
        max_players >= 2 && max_players <= MAX_PLAYERS,
        CerberusPokerError::GameFull
    );
    require!(
        deck_size == DECK_SIZE,
        CerberusPokerError::CardIndexOutOfRange
    );

    let game = &mut ctx.accounts.game_session;
    let clock = Clock::get()?;

    game.game_id = game_id;
    game.state = GameState::Lobby;
    game.max_players = max_players;
    game.deck_size = deck_size;
    game.num_players = 0;
    game.players = [Pubkey::default(); 10];
    game.active_computation_offset = 0;
    game.encrypted_deck_hash = [0u8; 32];
    game.shuffle_bitmap = 0;
    game.reveal_bitmap = [0u64; 52];
    game.unmasked_cards = [0xFF; 52]; // 0xFF = unrevealed
    game.card_assigned_to = [0xFE; 52]; // 0xFE = unassigned
    game.card_value_used = [0u64; 1];
    game.created_at = clock.unix_timestamp;
    game.shuffle_deadline = 0;
    game.reveal_deadline = 0;
    game.pending_reveal_card_index = 0xFE;
    game.pending_deal_card_index = 0xFE;
    game.pending_deal_player_index = 0xFE;
    game.bump = ctx.bumps.game_session;

    emit!(GameCreated {
        game_id,
        creator: ctx.accounts.creator.key(),
        max_players,
        deck_size,
    });

    msg!("Game {} created by {}", game_id, ctx.accounts.creator.key());
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = creator,
        space = GameSession::SPACE,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub game_session: Account<'info, GameSession>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}
