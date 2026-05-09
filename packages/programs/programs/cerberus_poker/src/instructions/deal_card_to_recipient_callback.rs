use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;

pub fn handler(
    ctx: Context<crate::DealCardToRecipientCallback>,
    output: ComputationOutputs<crate::DealCardToRecipientOutput>,
) -> Result<()> {
    // Match on the MXE output
    let card_value = match output {
        ComputationOutputs::Success(result) => result.field_0,
        ComputationOutputs::Failure => {
            msg!("Deal card MXE computation failed");
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;
    
    // Store the dealt card for the recipient
    let dealt_card = &mut ctx.accounts.dealt_card;
    dealt_card.game_id = game.game_id;
    dealt_card.card_value = card_value;
    dealt_card.bump = ctx.bumps.dealt_card;

    msg!("Card dealt successfully with value: {}", card_value);
    Ok(())
}

/// Stores the dealt card value for a specific player
/// After threshold decryption by the MXE, the card value is stored here
#[account]
pub struct DealtCard {
    pub game_id: u64,
    /// The card value (0-51) after threshold decryption
    pub card_value: u8,
    pub bump: u8,
}

impl DealtCard {
    pub const SPACE: usize = 8 + 8 + 1 + 1;
}

// The DealCardToRecipientCallback accounts struct is defined in lib.rs
