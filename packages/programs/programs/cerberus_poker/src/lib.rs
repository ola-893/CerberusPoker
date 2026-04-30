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

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("CrbsPkrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// Computation definition offsets — derived from instruction names via sha256
// These identify each MXE circuit on-chain
const COMP_DEF_OFFSET_SHUFFLE_DECK: u32 = comp_def_offset("shuffle_deck");
const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card");
const COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD: u32 = comp_def_offset("reveal_community_card");
const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = comp_def_offset("atomic_showdown");

#[arcium_program]
pub mod cerberus_poker {
    use super::*;

    // ─── Computation Definition Initialization ────────────────────────────────
    // Each must be called once after deployment to register the MXE circuit on-chain

    pub fn init_shuffle_deck_comp_def(ctx: Context<InitShuffleDeckCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, COMP_DEF_OFFSET_SHUFFLE_DECK, None, None)?;
        Ok(())
    }

    pub fn init_deal_card_comp_def(ctx: Context<InitDealCardCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, COMP_DEF_OFFSET_DEAL_CARD, None, None)?;
        Ok(())
    }

    pub fn init_reveal_community_card_comp_def(
        ctx: Context<InitRevealCommunityCardCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, COMP_DEF_OFFSET_REVEAL_COMMUNITY_CARD, None, None)?;
        Ok(())
    }

    pub fn init_atomic_showdown_comp_def(
        ctx: Context<InitAtomicShowdownCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, COMP_DEF_OFFSET_ATOMIC_SHOWDOWN, None, None)?;
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

    #[arcium_callback(encrypted_ix = "deal_card")]
    pub fn deal_card_callback(
        ctx: Context<DealCardCallback>,
        output: SignedComputationOutputs<DealCardOutput>,
    ) -> Result<()> {
        instructions::deal_card_callback::handler(ctx, output)
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
        assignments: Vec<(u8, u8)>, // (card_index, player_index)
        computation_offset: u64,
    ) -> Result<()> {
        instructions::deal_cards::handler(ctx, game_id, assignments, computation_offset)
    }

    pub fn timeout_shuffle(ctx: Context<TimeoutShuffle>, game_id: u64) -> Result<()> {
        instructions::timeout_shuffle::handler(ctx, game_id)
    }

    pub fn timeout_reveal(ctx: Context<TimeoutReveal>, game_id: u64) -> Result<()> {
        instructions::timeout_reveal::handler(ctx, game_id)
    }
}
