use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, CardRevealed};

const COMP_DEF_OFFSET_REVEAL_CARD: u32 = comp_def_offset("reveal_card");

/// Callback handler for reveal_card MXE computation.
///
/// This callback receives the plaintext card value from the MXE after
/// multi-party threshold decryption completes. The card value is then
/// stored on-chain and made publicly visible.
///
/// Note: The reveal_card MXE instruction returns a raw u8, not a struct.
/// The card_index must be tracked separately (via active_computation_offset
/// or passed through additional context).
///
/// Anti-cheating protections:
/// - Validates card value is in range (0-51)
/// - Prevents duplicate card values via card_value_used bitmap
/// - Marks card as revealed to prevent double-reveals
pub fn handler(
    ctx: Context<RevealCardCallback>,
    output: SignedComputationOutputs<u8>,
) -> Result<()> {
    let card_value = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(val) => val,
        Err(e) => {
            msg!("Reveal card MXE output verification failed: {}", e);
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;

    // Validate card value
    require!(card_value < 52, CerberusPokerError::CardValueOutOfRange);

    // Prevent duplicate card values
    require!(
        !game.is_card_value_used(card_value),
        CerberusPokerError::DuplicateCardValue
    );

    // Determine which card index was revealed
    // We need to find the card index that matches this computation
    // For now, we'll store it in the first unrevealed slot
    // In production, the card_index should be passed through the computation context
    let mut card_index = 0u8;
    for i in 0..game.deck_size {
        if !game.is_card_revealed(i) {
            card_index = i;
            break;
        }
    }

    // Store the revealed card value
    game.unmasked_cards[card_index as usize] = card_value;
    game.mark_card_revealed(card_index);
    game.mark_card_value_used(card_value);

    let game_id = game.game_id;
    emit!(CardRevealed {
        game_id,
        card_index,
        card_value,
    });

    msg!("Card {} revealed: value {}", card_index, card_value);
    Ok(())
}

#[callback_accounts("reveal_card")]
#[derive(Accounts)]
pub struct RevealCardCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_CARD))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,
}
