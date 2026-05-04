use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, REVEAL_TIMEOUT_SECS};

const COMP_DEF_OFFSET_REVEAL_CARD: u32 = comp_def_offset("reveal_card");

/// Queue a reveal_card computation to reveal a community card.
///
/// This instruction queues an MXE computation that performs multi-party
/// threshold decryption to reveal a single community card. All active
/// players must contribute their reveal tokens for the computation to
/// complete successfully.
///
/// The card value will be returned via the reveal_card_callback.
pub fn handler(
    ctx: Context<RevealCard>,
    game_id: u64,
    card_index: u8,
    computation_offset: u64,
) -> Result<()> {
    let game = &mut ctx.accounts.game_session;

    // Validate card index
    require!(
        card_index < game.deck_size,
        CerberusPokerError::CardIndexOutOfRange
    );

    // Ensure card hasn't been revealed yet
    require!(
        !game.is_card_revealed(card_index),
        CerberusPokerError::CardAlreadyRevealed
    );

    // Store the active computation offset for tracking
    game.active_computation_offset = computation_offset;

    // Set reveal deadline for timeout enforcement
    let clock = Clock::get()?;
    game.reveal_deadline = clock.unix_timestamp + REVEAL_TIMEOUT_SECS;

    // Build arguments for reveal_card MXE instruction:
    // reveal_card(card: Enc<Mxe, EncryptedCard>, card_index: u8) -> u8
    //
    // Arguments:
    // - Encrypted card (ElGamal ciphertext: C1, C2)
    // - Card index (plaintext u8)
    let args = ArgBuilder::new()
        .encrypted_u8(ctx.accounts.encrypted_card_c1.key().to_bytes())
        .encrypted_u8(ctx.accounts.encrypted_card_c2.key().to_bytes())
        .plaintext_u8(card_index)
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Queue the computation with callback
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::instructions::reveal_card_callback::RevealCardCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1, // num_callback_txs
        0, // cu_price_micro (no priority fee)
    )?;

    msg!(
        "Queued reveal_card computation for card {} (offset: {})",
        card_index,
        computation_offset
    );
    Ok(())
}

#[queue_computation_accounts("reveal_card", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, card_index: u8, computation_offset: u64)]
pub struct RevealCard<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    pub game_session: Account<'info, GameSession>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_CARD))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    // Encrypted card input for reveal_card MXE instruction
    // The card is represented as an ElGamal ciphertext (C1, C2)
    /// CHECK: encrypted_card_c1 - first component of ElGamal ciphertext
    pub encrypted_card_c1: UncheckedAccount<'info>,
    /// CHECK: encrypted_card_c2 - second component of ElGamal ciphertext
    pub encrypted_card_c2: UncheckedAccount<'info>,
}
