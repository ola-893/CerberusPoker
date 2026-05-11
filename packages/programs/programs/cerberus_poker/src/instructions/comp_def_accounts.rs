use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

const COMP_DEF_OFFSET_SHUFFLE_DECK: u32 = comp_def_offset("shuffle_deck_demo");
const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card_to_recipient");
const COMP_DEF_OFFSET_REVEAL_CARD: u32 = comp_def_offset("reveal_card");
const COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD: u32 = comp_def_offset("reveal_community_card");
const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = comp_def_offset("atomic_showdown_demo");

/// Accounts for initializing the shuffle_deck computation definition.
/// Called once after deployment.
#[derive(Accounts)]
pub struct InitShuffleDeckCompDef<'info> {
    #[account(
        init,
        payer = payer,
        space = ComputationDefinitionAccount::SPACE,
        seeds = [b"comp_def", &COMP_DEF_OFFSET_SHUFFLE_DECK.to_le_bytes()],
        bump,
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the deal_card computation definition.
#[derive(Accounts)]
pub struct InitDealCardCompDef<'info> {
    #[account(
        init,
        payer = payer,
        space = ComputationDefinitionAccount::SPACE,
        seeds = [b"comp_def", &COMP_DEF_OFFSET_DEAL_CARD.to_le_bytes()],
        bump,
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the reveal_card computation definition.
#[derive(Accounts)]
pub struct InitRevealCardCompDef<'info> {
    #[account(
        init,
        payer = payer,
        space = ComputationDefinitionAccount::SPACE,
        seeds = [b"comp_def", &COMP_DEF_OFFSET_REVEAL_CARD.to_le_bytes()],
        bump,
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the reveal_community_card computation definition.
#[derive(Accounts)]
pub struct InitRevealCommunityCardCompDef<'info> {
    #[account(
        init,
        payer = payer,
        space = ComputationDefinitionAccount::SPACE,
        seeds = [b"comp_def", &COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD.to_le_bytes()],
        bump,
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the atomic_showdown computation definition.
#[derive(Accounts)]
pub struct InitAtomicShowdownCompDef<'info> {
    #[account(
        init,
        payer = payer,
        space = ComputationDefinitionAccount::SPACE,
        seeds = [b"comp_def", &COMP_DEF_OFFSET_ATOMIC_SHOWDOWN.to_le_bytes()],
        bump,
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
