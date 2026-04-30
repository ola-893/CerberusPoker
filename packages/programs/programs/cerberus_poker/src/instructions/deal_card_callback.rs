use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;

use crate::errors::CerberusPokerError;
use crate::state::GameSession;

const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card");

/// Output from the deal_card MXE instruction.
/// Returns Enc<Shared, u8> — the card value encrypted for the recipient.
/// The ciphertext is stored so the recipient can decrypt it client-side.
#[derive(AnchorDeserialize)]
pub struct DealCardOutput {
    /// Encrypted card value — only the recipient can decrypt with their x25519 key
    pub ciphertext: [u8; 32],
    /// Nonce used for encryption (needed for decryption)
    pub nonce: [u8; 16],
    /// Card index this deal corresponds to
    pub card_index: u8,
}

pub fn handler(
    ctx: Context<DealCardCallback>,
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

    // The encrypted card is stored in a separate DealtCard account
    // so the recipient can fetch and decrypt it client-side
    let dealt_card = &mut ctx.accounts.dealt_card;
    dealt_card.game_id = ctx.accounts.game_session.game_id;
    dealt_card.card_index = result.card_index;
    dealt_card.ciphertext = result.ciphertext;
    dealt_card.nonce = result.nonce;
    dealt_card.bump = ctx.bumps.dealt_card;

    msg!("Card {} dealt successfully", result.card_index);
    Ok(())
}

/// Stores the encrypted card for a specific player to fetch and decrypt
#[account]
pub struct DealtCard {
    pub game_id: u64,
    pub card_index: u8,
    /// Enc<Shared, u8> ciphertext — only recipient can decrypt
    pub ciphertext: [u8; 32],
    pub nonce: [u8; 16],
    pub bump: u8,
}

impl DealtCard {
    pub const SPACE: usize = 8 + 8 + 1 + 32 + 16 + 1;
}

#[callback_accounts("deal_card")]
#[derive(Accounts)]
pub struct DealCardCallback<'info> {
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

    pub game_session: Account<'info, GameSession>,

    /// Stores the encrypted card for the recipient to fetch
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
}
