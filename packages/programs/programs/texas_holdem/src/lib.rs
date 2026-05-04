/// CerberusPoker — Texas Hold'em Reference Implementation
///
/// Builds on top of cerberus_poker via CPI. Adds:
/// - Betting rounds (pre-flop, flop, turn, river)
/// - USDC+ escrow via Reflect Protocol
/// - MXE-encrypted bet amounts (Enc<Mxe, u64>)
/// - On-chain hand evaluation
/// - Pot settlement triggered by atomic_showdown callback

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod errors;
pub mod hand_eval;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("TxHldXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

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
        output: SignedComputationOutputs<PlaceBetOutput>,
    ) -> Result<()> {
        instructions::place_bet_callback::handler(ctx, output)
    }

    // MXE callback for atomic_showdown — settles pot to winner(s)
    #[arcium_callback(encrypted_ix = "atomic_showdown")]
    pub fn settle_showdown(
        ctx: Context<SettleShowdown>,
        game_id: u64,
        output: SignedComputationOutputs<AtomicShowdownOutput>,
        community_cards: [u8; 5],
    ) -> Result<()> {
        instructions::settle_showdown::handler(ctx, game_id, output, community_cards)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Action {
    Fold,
    Check,
    Call,
    Raise,
    AllIn,
}
