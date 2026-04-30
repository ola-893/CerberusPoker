use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, CardDealt, COMMUNITY_CARD, UNASSIGNED};

const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card");

pub fn handler(
    ctx: Context<DealCards>,
    game_id: u64,
    assignments: Vec<(u8, u8)>, // (card_index, player_index)
    computation_offset: u64,
) -> Result<()> {
    let game = &mut ctx.accounts.game_session;

    require!(game.state == GameState::Deal, CerberusPokerError::InvalidGameState);

    // Record card assignments
    for (card_index, player_index) in &assignments {
        require!(*card_index < game.deck_size, CerberusPokerError::CardIndexOutOfRange);
        require!(
            game.card_assigned_to[*card_index as usize] == UNASSIGNED,
            CerberusPokerError::CardAlreadyRevealed
        );

        game.card_assigned_to[*card_index as usize] = *player_index;

        emit!(CardDealt {
            game_id,
            card_index: *card_index,
            player_index: *player_index,
        });
    }

    game.active_computation_offset = computation_offset;

    // Queue deal_card computation for the first assigned card
    // The MXE will re-encrypt the card for the specific recipient
    // Subsequent cards are queued in the deal_card_callback
    let args = ArgBuilder::new()
        .plaintext_u128(computation_offset as u128)
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DealCardCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,
        0,
    )?;

    Ok(())
}

#[queue_computation_accounts("deal_card", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, assignments: Vec<(u8, u8)>, computation_offset: u64)]
pub struct DealCards<'info> {
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

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEAL_CARD))]
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
}
