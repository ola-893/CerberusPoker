use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::CerberusPokerError;

const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card_to_recipient");

/// Output from the deal_card_to_recipient MXE instruction.
/// Returns plaintext u8 — the card value after threshold decryption.
/// The MXE performs threshold decryption and reveals the card value
/// to the specific recipient through this callback.
#[derive(AnchorDeserialize)]
pub struct DealCardOutput {
    /// The card value (0-51) after threshold decryption
    pub card_value: u8,
}

pub fn handler(
    ctx: Context<DealCardToRecipientCallback>,
    output: SignedComputationOutputs<DealCardOutput>,
) -> Result<()> {
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(out) => out,
        Err(e) => {
            msg!("Deal card MXE output verification failed: {}", e);
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;
    
    // Store the dealt card for the recipient
    let dealt_card = &mut ctx.accounts.dealt_card;
    dealt_card.game_id = game.game_id;
    dealt_card.card_value = result.card_value;
    dealt_card.bump = ctx.bumps.dealt_card;

    msg!("Card dealt successfully with value: {}", result.card_value);
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

#[callback_accounts("deal_card_to_recipient")]
#[derive(Accounts)]
pub struct DealCardToRecipientCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEAL_CARD))]
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

    /// Stores the dealt card value for the recipient
    #[account(
        init_if_needed,
        payer = payer,
        space = DealtCard::SPACE,
        seeds = [b"dealt_card", game_session.game_id.to_le_bytes().as_ref(), &[0u8]],
        bump,
    )]
    pub dealt_card: Account<'info, DealtCard>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    
    /// CHECK: Required by Arcium callback macro
    pub instructions_sysvar: UncheckedAccount<'info>,
}
