use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, ShowdownComplete};

pub fn handler(
    ctx: Context<crate::AtomicShowdownCallback>,
    output: ComputationOutputs<crate::AtomicShowdownOutput>,
) -> Result<()> {
    // Match on the MXE output
    // For now, field_0 contains the revealed_hands array
    // In production, the MXE circuit should return both revealed_hands and num_players
    let revealed_hands = match output {
        ComputationOutputs::Success(result) => result.field_0,
        ComputationOutputs::Failure => {
            msg!("Atomic showdown MXE computation failed");
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;

    // Determine number of players from game state
    let num_players = game.num_players;

    // Store all revealed hole card values
    for i in 0..(num_players as usize * 2) {
        let card_value = revealed_hands[i];
        require!(card_value < 52, CerberusPokerError::CardValueOutOfRange);
        require!(
            !game.is_card_value_used(card_value),
            CerberusPokerError::DuplicateCardValue
        );
        game.mark_card_value_used(card_value);
    }

    // Transition to Complete — hand evaluation happens in texas_holdem program
    game.state = GameState::Complete;

    let game_id = game.game_id;
    emit!(ShowdownComplete {
        game_id,
        revealed_hands,
        num_players,
    });

    msg!(
        "Atomic showdown complete for game {}. {} players revealed.",
        game_id,
        num_players
    );

    Ok(())
}

// The AtomicShowdownCallback accounts struct is defined in lib.rs
