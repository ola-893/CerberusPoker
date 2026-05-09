use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, ShuffleComplete};

pub fn handler(
    ctx: Context<crate::ShuffleDeckCallback>,
    output: ComputationOutputs<crate::ShuffleDeckOutput>,
) -> Result<()> {
    // Match on the MXE output — Success contains the result, Failure means computation failed
    // The macro generates a tuple struct with field_0
    // Note: The MXE circuit is not yet implemented, so this is a placeholder
    let _deck_encrypted = match output {
        ComputationOutputs::Success(result) => result.field_0,
        ComputationOutputs::Failure => {
            msg!("MXE computation failed");
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;

    // Verify we're in the right state
    require!(game.state == GameState::Shuffle, CerberusPokerError::InvalidGameState);

    // Store a placeholder deck commitment hash on-chain
    // TODO: Once MXE circuit is implemented, extract actual hash from encrypted output
    // For now, use a deterministic placeholder based on computation offset
    let deck_hash = [0u8; 32]; // Placeholder

    game.encrypted_deck_hash = deck_hash;

    // Transition to Deal phase — deck is now shuffled and committed
    game.state = GameState::Deal;
    game.shuffle_deadline = 0; // Clear deadline

    let game_id = game.game_id;
    emit!(ShuffleComplete {
        game_id,
        deck_hash,
    });

    msg!(
        "Shuffle complete for game {}. Deck hash stored.",
        game_id
    );

    Ok(())
}

// The ShuffleDeckCallback accounts struct is defined in lib.rs
