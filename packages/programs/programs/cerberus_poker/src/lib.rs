use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG");

// Computation definition offsets — derived from instruction names via sha256
// These identify each MXE circuit on-chain
const COMP_DEF_OFFSET_SHUFFLE_DECK: u32 = comp_def_offset("shuffle_deck_demo");
const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card_to_recipient");
const COMP_DEF_OFFSET_REVEAL_CARD: u32 = comp_def_offset("reveal_card");
const COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD: u32 = comp_def_offset("reveal_community_card");
const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = comp_def_offset("atomic_showdown_demo");

/// Card assignment for deal_cards instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CardAssignment {
    pub card_index: u8,
    pub player_index: u8,
}

#[arcium_program]
pub mod cerberus_poker {
    use super::*;

    // ─── Computation Definition Initialization ────────────────────────────────
    // Each must be called once after deployment to register the MXE circuit on-chain

    pub fn init_shuffle_deck_comp_def(ctx: Context<InitShuffleDeckCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_deal_card_comp_def(ctx: Context<InitDealCardCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_reveal_card_comp_def(ctx: Context<InitRevealCardCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_reveal_community_card_comp_def(
        ctx: Context<InitRevealCommunityCardCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_atomic_showdown_comp_def(ctx: Context<InitAtomicShowdownCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ─── Game Lifecycle ───────────────────────────────────────────────────────

    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: u64,
        max_players: u8,
        deck_size: u8,
    ) -> Result<()> {
        instructions::create_game::handler(ctx, game_id, max_players, deck_size)
    }

    pub fn join_game(ctx: Context<JoinGame>, game_id: u64) -> Result<()> {
        instructions::join_game::handler(ctx, game_id)
    }

    pub fn start_shuffle(
        ctx: Context<StartShuffle>,
        game_id: u64,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::start_shuffle::handler(ctx, game_id, computation_offset)
    }

    // ─── MXE Callbacks ────────────────────────────────────────────────────────

    #[arcium_callback(encrypted_ix = "shuffle_deck_demo")]
    pub fn shuffle_deck_callback(
        ctx: Context<ShuffleDeckCallback>,
        output: SignedComputationOutputs<ShuffleDeckDemoOutput>,
    ) -> Result<()> {
        instructions::shuffle_deck_callback::handler(ctx, output)
    }

    #[arcium_callback(encrypted_ix = "deal_card_to_recipient")]
    pub fn deal_card_to_recipient_callback(
        ctx: Context<DealCardToRecipientCallback>,
        output: SignedComputationOutputs<DealCardToRecipientOutput>,
    ) -> Result<()> {
        instructions::deal_card_to_recipient_callback::handler(ctx, output)
    }

    #[arcium_callback(encrypted_ix = "reveal_card")]
    pub fn reveal_card_callback(
        ctx: Context<RevealCardCallback>,
        output: SignedComputationOutputs<RevealCardOutput>,
    ) -> Result<()> {
        instructions::reveal_card_callback::handler(ctx, output)
    }

    #[arcium_callback(encrypted_ix = "reveal_community_card")]
    pub fn reveal_community_card_callback(
        ctx: Context<RevealCommunityCardCallback>,
        output: SignedComputationOutputs<RevealCommunityCardOutput>,
    ) -> Result<()> {
        instructions::reveal_community_card_callback::handler(ctx, output)
    }

    #[arcium_callback(encrypted_ix = "atomic_showdown_demo")]
    pub fn atomic_showdown_callback(
        ctx: Context<AtomicShowdownCallback>,
        output: SignedComputationOutputs<AtomicShowdownDemoOutput>,
    ) -> Result<()> {
        instructions::atomic_showdown_callback::handler(ctx, output)
    }

    // ─── Deal & Timeout ───────────────────────────────────────────────────────

    pub fn deal_cards(
        ctx: Context<DealCards>,
        game_id: u64,
        assignments: Vec<CardAssignment>, // (card_index, player_index)
        computation_offset: u64,
    ) -> Result<()> {
        // Convert CardAssignment structs to tuples for the handler
        let assignments_tuples: Vec<(u8, u8)> = assignments
            .into_iter()
            .map(|a| (a.card_index, a.player_index))
            .collect();
        instructions::deal_cards::handler(ctx, game_id, assignments_tuples, computation_offset)
    }

    pub fn reveal_card(
        ctx: Context<RevealCard>,
        game_id: u64,
        card_index: u8,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::reveal_card::handler(ctx, game_id, card_index, computation_offset)
    }

    pub fn timeout_shuffle(ctx: Context<TimeoutShuffle>, game_id: u64) -> Result<()> {
        instructions::timeout_shuffle::handler(ctx, game_id)
    }

    pub fn timeout_reveal(ctx: Context<TimeoutReveal>, game_id: u64) -> Result<()> {
        instructions::timeout_reveal::handler(ctx, game_id)
    }
}

// Callback accounts structs must be defined in lib.rs for #[arcium_program] macro to find them
use errors::CerberusPokerError;
use errors::CerberusPokerError as ErrorCode;
use instructions::deal_card_to_recipient_callback::DealtCard;
use state::GameSession;

#[callback_accounts("shuffle_deck_demo")]
#[derive(Accounts)]
pub struct ShuffleDeckCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SHUFFLE_DECK))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub game_session: Box<Account<'info, GameSession>>,
}

#[callback_accounts("deal_card_to_recipient")]
#[derive(Accounts)]
pub struct DealCardToRecipientCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEAL_CARD))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub game_session: Box<Account<'info, GameSession>>,

    #[account(
        init_if_needed,
        payer = payer,
        space = DealtCard::SPACE,
        seeds = [
            b"dealt_card",
            game_session.key().as_ref(),
            &[game_session.pending_deal_player_index],
            &[game_session.pending_deal_card_index],
        ],
        bump
    )]
    pub dealt_card: Account<'info, DealtCard>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[callback_accounts("reveal_card")]
#[derive(Accounts)]
pub struct RevealCardCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_CARD))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub game_session: Box<Account<'info, GameSession>>,
}

#[callback_accounts("reveal_community_card")]
#[derive(Accounts)]
pub struct RevealCommunityCardCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub game_session: Box<Account<'info, GameSession>>,
}

#[callback_accounts("atomic_showdown_demo")]
#[derive(Accounts)]
pub struct AtomicShowdownCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ATOMIC_SHOWDOWN))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub game_session: Box<Account<'info, GameSession>>,
}
