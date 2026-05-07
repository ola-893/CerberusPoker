pub mod random;
/// CerberusPoker — Game-Agnostic Mental Poker Protocol Program
///
/// This program handles the full lifecycle of a private card game session:
/// - Player registration and key management
/// - Confidential deck shuffle via Arcium MXE (Cerberus protocol)
/// - Card dealing and reveal via MXE threshold decryption
/// - Timeout enforcement for liveness
///
/// Any card game (Texas Hold'em, Blackjack, Bridge) can use this program
/// as the privacy layer by calling it via CPI and implementing their own
/// game logic on top.
///
/// Uses #[arcium_program] instead of #[program] — required for Arcium MXE
/// integration. This macro adds the necessary Arcium accounts and CPI
/// infrastructure for queue_computation and callback handling.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::circuit_hash;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Computation definition offsets — derived from instruction names via sha256
// These identify each MXE circuit on-chain
const COMP_DEF_HASH_SHUFFLE_DECK: [u8; 32] = circuit_hash!("shuffle_deck");
const COMP_DEF_HASH_DEAL_CARD: [u8; 32] = circuit_hash!("deal_card_to_recipient");
const COMP_DEF_HASH_REVEAL_CARD: [u8; 32] = circuit_hash!("reveal_card");
const COMP_DEF_HASH_REVEAL_COMMUNITY_CARD: [u8; 32] = circuit_hash!("reveal_community_card");
const COMP_DEF_HASH_ATOMIC_SHOWDOWN: [u8; 32] = circuit_hash!("atomic_showdown");

// Convert first 4 bytes of hash to u32 for PDA derivation
const fn hash_to_offset(hash: &[u8; 32]) -> u32 {
    u32::from_le_bytes([hash[0], hash[1], hash[2], hash[3]])
}

const COMP_DEF_OFFSET_SHUFFLE_DECK: u32 = hash_to_offset(&COMP_DEF_HASH_SHUFFLE_DECK);
const COMP_DEF_OFFSET_DEAL_CARD: u32 = hash_to_offset(&COMP_DEF_HASH_DEAL_CARD);
const COMP_DEF_OFFSET_REVEAL_CARD: u32 = hash_to_offset(&COMP_DEF_HASH_REVEAL_CARD);
const COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD: u32 = hash_to_offset(&COMP_DEF_HASH_REVEAL_COMMUNITY_CARD);
const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = hash_to_offset(&COMP_DEF_HASH_ATOMIC_SHOWDOWN);

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
        init_comp_def(ctx.accounts)?;
        Ok(())
    }

    pub fn init_deal_card_comp_def(ctx: Context<InitDealCardCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts)?;
        Ok(())
    }

    pub fn init_reveal_card_comp_def(ctx: Context<InitRevealCardCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts)?;
        Ok(())
    }

    pub fn init_reveal_community_card_comp_def(
        ctx: Context<InitRevealCommunityCardCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts)?;
        Ok(())
    }

    pub fn init_atomic_showdown_comp_def(
        ctx: Context<InitAtomicShowdownCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts)?;
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

    #[arcium_callback(encrypted_ix = "shuffle_deck")]
    pub fn shuffle_deck_callback(
        ctx: Context<ShuffleDeckCallback>,
        output: SignedComputationOutputs<ShuffleDeckOutput>,
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

    #[arcium_callback(encrypted_ix = "atomic_showdown")]
    pub fn atomic_showdown_callback(
        ctx: Context<AtomicShowdownCallback>,
        output: SignedComputationOutputs<AtomicShowdownOutput>,
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
use state::GameSession;
use instructions::deal_card_to_recipient_callback::DealtCard;

#[callback_accounts("shuffle_deck")]
#[derive(Accounts)]
pub struct ShuffleDeckCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SHUFFLE_DECK))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ArciumError::InvalidClusterBLSPublicKey)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
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
        address = derive_cluster_pda!(mxe_account, ArciumError::InvalidClusterBLSPublicKey)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,

    #[account(
        init_if_needed,
        payer = payer,
        space = DealtCard::SPACE,
        seeds = [b"dealt_card", game_session.key().as_ref()],
        bump
    )]
    pub dealt_card: Account<'info, DealtCard>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
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
        address = derive_cluster_pda!(mxe_account, ArciumError::InvalidClusterBLSPublicKey)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("reveal_community_card")]
#[derive(Accounts)]
pub struct RevealCommunityCardCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ArciumError::InvalidClusterBLSPublicKey)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("atomic_showdown")]
#[derive(Accounts)]
pub struct AtomicShowdownCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ATOMIC_SHOWDOWN))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ArciumError::InvalidClusterBLSPublicKey)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}
