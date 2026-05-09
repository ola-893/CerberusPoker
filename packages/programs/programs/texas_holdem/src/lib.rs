use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod errors;
pub mod hand_eval;
pub mod instructions;
pub mod state;

use instructions::*;
use errors::TexasHoldemError;
use state::PokerTable;

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65");

// Computation definition offsets
const COMP_DEF_OFFSET_PLACE_BET: u32 = comp_def_offset("place_bet");
const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = comp_def_offset("atomic_showdown");

#[arcium_program]
pub mod texas_holdem {
    use super::*;

    pub fn create_table(
        ctx: Context<CreateTable>,
        game_id: u64,
        small_blind: u64,
        big_blind: u64,
    ) -> Result<()> {
        instructions::create_table::handler(ctx, game_id, small_blind, big_blind)
    }

    pub fn post_blinds(ctx: Context<PostBlinds>, game_id: u64, num_players: u8) -> Result<()> {
        instructions::post_blinds::handler(ctx, game_id, num_players)
    }

    pub fn player_action(
        ctx: Context<PlayerAction>,
        game_id: u64,
        action: Action,
        amount: u64,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::player_action::handler(ctx, game_id, action, amount, computation_offset)
    }

    pub fn advance_phase(ctx: Context<AdvancePhase>, game_id: u64) -> Result<()> {
        instructions::advance_phase::handler(ctx, game_id)
    }

    pub fn verify_hole_cards(
        ctx: Context<VerifyHoleCards>,
        game_id: u64,
        player_index: u8,
    ) -> Result<()> {
        instructions::verify_hole_cards::handler(ctx, game_id, player_index)
    }

    pub fn showdown(ctx: Context<Showdown>, game_id: u64) -> Result<()> {
        instructions::showdown::handler(ctx, game_id)
    }

    pub fn timeout_bet(ctx: Context<TimeoutBet>, game_id: u64) -> Result<()> {
        instructions::timeout_bet::handler(ctx, game_id)
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        game_id: u64,
        amount: u64,
        player_index: u8,
        computation_offset: u64,
    ) -> Result<()> {
        instructions::place_bet::handler(ctx, game_id, amount, player_index, computation_offset)
    }

    // MXE callback for place_bet — stores encrypted bet amount
    #[arcium_callback(encrypted_ix = "place_bet")]
    pub fn place_bet_callback(
        ctx: Context<PlaceBetCallback>,
        output: ComputationOutputs<PlaceBetOutput>,
    ) -> Result<()> {
        instructions::place_bet_callback::handler(ctx, output)
    }

    // MXE callback for atomic_showdown — settles pot to winner(s)
    #[arcium_callback(encrypted_ix = "atomic_showdown")]
    pub fn atomic_showdown_callback(
        ctx: Context<AtomicShowdownCallback>,
        output: ComputationOutputs<AtomicShowdownOutput>,
    ) -> Result<()> {
        instructions::atomic_showdown_callback::handler(ctx, output)
    }
}

// Callback accounts structs must be defined in lib.rs for #[arcium_program] macro to find them
#[callback_accounts("place_bet")]
#[derive(Accounts)]
pub struct PlaceBetCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_BET))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, TexasHoldemError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub poker_table: Account<'info, PokerTable>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("atomic_showdown")]
#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct AtomicShowdownCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ATOMIC_SHOWDOWN))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, TexasHoldemError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    /// The PokerTable PDA for this game
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,

    /// Escrow PDA token account (source of pot funds)
    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidGameState
    )]
    pub escrow_account: Account<'info, anchor_spl::token::TokenAccount>,

    /// SPL Token program for USDC+ transfer
    pub token_program: Program<'info, anchor_spl::token::Token>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Action {
    Fold,
    Check,
    Call,
    Raise,
    AllIn,
}
