use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;
use crate::state::CardRevealed;

pub fn handler(
    ctx: Context<crate::RevealCommunityCardCallback>,
    output: SignedComputationOutputs<crate::RevealCommunityCardOutput>,
) -> Result<()> {
    let card_value = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| CerberusPokerError::AbortedComputation)?
        .field_0;

    let game = &mut ctx.accounts.game_session;

    // Validate card value
    require!(card_value < 52, CerberusPokerError::CardValueOutOfRange);

    // Prevent duplicate card values
    require!(
        !game.is_card_value_used(card_value),
        CerberusPokerError::DuplicateCardValue
    );

    let card_index = game.pending_reveal_card_index;
    require!(
        card_index < game.deck_size,
        CerberusPokerError::CardIndexOutOfRange
    );
    require!(
        !game.is_card_revealed(card_index),
        CerberusPokerError::CardAlreadyRevealed
    );

    // Store the revealed card value
    game.unmasked_cards[card_index as usize] = card_value;
    game.mark_card_revealed(card_index);
    game.mark_card_value_used(card_value);
    game.pending_reveal_card_index = 0xFE;

    let game_id = game.game_id;
    emit!(CardRevealed {
        game_id,
        card_index,
        card_value,
    });

    msg!(
        "Community card {} revealed: value {}",
        card_index,
        card_value
    );
    Ok(())
}

// The RevealCommunityCardCallback accounts struct is defined in lib.rs
