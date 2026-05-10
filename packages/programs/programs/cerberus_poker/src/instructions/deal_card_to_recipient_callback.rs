use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;

pub fn handler(
    ctx: Context<crate::DealCardToRecipientCallback>,
    output: SignedComputationOutputs<crate::DealCardToRecipientOutput>,
) -> Result<()> {
    let card_value = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| CerberusPokerError::AbortedComputation)?
        .field_0;

    let game = &mut ctx.accounts.game_session;
    let card_index = game.pending_deal_card_index;
    let player_index = game.pending_deal_player_index;

    require!(card_value < 52, CerberusPokerError::CardValueOutOfRange);
    require!(
        card_index < game.deck_size,
        CerberusPokerError::CardIndexOutOfRange
    );
    require!(
        player_index < game.num_players,
        CerberusPokerError::PlayerNotFound
    );

    // Store the dealt card for the recipient
    let dealt_card = &mut ctx.accounts.dealt_card;
    dealt_card.game_id = game.game_id;
    dealt_card.card_index = card_index;
    dealt_card.player_index = player_index;
    dealt_card.card_value = card_value;
    dealt_card.bump = ctx.bumps.dealt_card;

    game.pending_deal_card_index = 0xFE;
    game.pending_deal_player_index = 0xFE;

    msg!("Card {} dealt to player {}", card_index, player_index);
    Ok(())
}

/// Stores the dealt card value for a specific player
/// After threshold decryption by the MXE, the card value is stored here
#[account]
pub struct DealtCard {
    pub game_id: u64,
    pub card_index: u8,
    pub player_index: u8,
    /// The card value (0-51) after threshold decryption
    pub card_value: u8,
    pub bump: u8,
}

impl DealtCard {
    pub const SPACE: usize = 8 + 8 + 1 + 1 + 1 + 1;
}

// The DealCardToRecipientCallback accounts struct is defined in lib.rs
