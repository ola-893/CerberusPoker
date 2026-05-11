use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;
use crate::state::{GameState, ShowdownComplete};

pub fn handler(
    ctx: Context<crate::AtomicShowdownCallback>,
    output: SignedComputationOutputs<crate::AtomicShowdownDemoOutput>,
) -> Result<()> {
    let revealed_hands = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| CerberusPokerError::AbortedComputation)?
        .field_0;

    let game = &mut ctx.accounts.game_session;

    // Determine number of players from game state
    let num_players = game.num_players.min(crate::state::MAX_PLAYERS);

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
