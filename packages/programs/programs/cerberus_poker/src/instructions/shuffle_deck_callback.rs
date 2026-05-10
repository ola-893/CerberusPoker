use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use solana_sha256_hasher::hashv;

use crate::errors::CerberusPokerError;
use crate::state::{GameState, ShuffleComplete};

pub fn handler(
    ctx: Context<crate::ShuffleDeckCallback>,
    output: SignedComputationOutputs<crate::ShuffleDeckOutput>,
) -> Result<()> {
    let deck_encrypted = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| CerberusPokerError::AbortedComputation)?
        .field_0;

    let game = &mut ctx.accounts.game_session;

    // Verify we're in the right state
    require!(
        game.state == GameState::Shuffle,
        CerberusPokerError::InvalidGameState
    );

    let mut deck_bytes = Vec::new();
    deck_encrypted
        .serialize(&mut deck_bytes)
        .map_err(|_| CerberusPokerError::InvalidMxeOutput)?;
    let game_id_bytes = game.game_id.to_le_bytes();
    let computation_offset_bytes = game.active_computation_offset.to_le_bytes();
    let deck_hash = hashv(&[
        b"cerberus_poker:deck",
        game.key().as_ref(),
        game_id_bytes.as_ref(),
        computation_offset_bytes.as_ref(),
        deck_bytes.as_ref(),
    ])
    .to_bytes();

    game.encrypted_deck_hash = deck_hash;

    // Transition to Deal phase — deck is now shuffled and committed
    game.state = GameState::Deal;
    game.shuffle_deadline = 0; // Clear deadline

    let game_id = game.game_id;
    emit!(ShuffleComplete { game_id, deck_hash });

    msg!("Shuffle complete for game {}. Deck hash stored.", game_id);

    Ok(())
}

// The ShuffleDeckCallback accounts struct is defined in lib.rs
