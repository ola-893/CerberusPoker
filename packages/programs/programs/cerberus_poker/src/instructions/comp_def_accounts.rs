use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

/// Accounts for initializing the shuffle_deck computation definition.
#[init_computation_definition_accounts("shuffle_deck", payer)]
#[derive(Accounts)]
pub struct InitShuffleDeckCompDef<'info> {
    #[account(mut)]
    /// CHECK: initialized via CPI
    pub comp_def_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the deal_card_to_recipient computation definition.
#[init_computation_definition_accounts("deal_card_to_recipient", payer)]
#[derive(Accounts)]
pub struct InitDealCardCompDef<'info> {
    #[account(mut)]
    /// CHECK: initialized via CPI
    pub comp_def_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the reveal_card computation definition.
#[init_computation_definition_accounts("reveal_card", payer)]
#[derive(Accounts)]
pub struct InitRevealCardCompDef<'info> {
    #[account(mut)]
    /// CHECK: initialized via CPI
    pub comp_def_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the reveal_community_card computation definition.
#[init_computation_definition_accounts("reveal_community_card", payer)]
#[derive(Accounts)]
pub struct InitRevealCommunityCardCompDef<'info> {
    #[account(mut)]
    /// CHECK: initialized via CPI
    pub comp_def_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Accounts for initializing the atomic_showdown computation definition.
#[init_computation_definition_accounts("atomic_showdown", payer)]
#[derive(Accounts)]
pub struct InitAtomicShowdownCompDef<'info> {
    #[account(mut)]
    /// CHECK: initialized via CPI
    pub comp_def_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
