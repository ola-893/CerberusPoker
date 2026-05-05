use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::circuit_hash;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, CardRevealed};

const COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD: u32 = circuit_hash!("reveal_community_card");

/// Output from reveal_community_card MXE instruction.
/// Returns plaintext u8 — community cards are public after reveal.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RevealCommunityCardOutput {
    /// Plaintext card value (0-51) — revealed to all
    pub card_value: u8,
    /// Which card index was revealed
    pub card_index: u8,
}

pub fn handler(
    ctx: Context<RevealCommunityCardCallback>,
    output: SignedComputationOutputs<RevealCommunityCardOutput>,
) -> Result<()> {
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(out) => out,
        Err(e) => {
            msg!("Reveal community card MXE output verification failed: {}", e);
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;
    let card_index = result.card_index;
    let card_value = result.card_value;

    // Validate card value
    require!(card_value < 52, CerberusPokerError::CardValueOutOfRange);

    // Prevent duplicate card values
    require!(
        !game.is_card_value_used(card_value),
        CerberusPokerError::DuplicateCardValue
    );

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

    msg!("Community card {} revealed: value {}", card_index, card_value);
    Ok(())
}

#[derive(Accounts)]
#[derive(Accounts)]
pub struct RevealCommunityCardCallback<'info> {
    /// CHECK: instructions_sysvar, checked by arcium program.
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD))]
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

impl arcium_anchor::HasSize for RevealCommunityCardOutput {
    const SIZE: usize = 2;
}
