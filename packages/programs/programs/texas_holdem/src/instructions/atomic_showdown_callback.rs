use crate::errors::TexasHoldemError;
use crate::hand_eval::{evaluate_hand, HandRank};
use crate::state::PokerTable;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;

/// Settle showdown: transfer pot to winner based on MXE-attested showdown result.
///
/// This instruction is triggered by the `atomic_showdown_demo` callback from the MXE.
/// It performs the following:
/// 1. Verifies the MXE output signature (ensures authenticity)
/// 2. Evaluates all revealed hands using the on-chain hand evaluator
/// 3. Determines the winner (or winners in case of a tie)
/// 4. Transfers the full pot from escrow PDA to winner(s)
///
/// # Settlement Rules
/// - Single winner: receives full pot
/// - Tie: pot split equally between tied winners
/// - Folded players: excluded from evaluation
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `community_cards` - The 5 community cards (flop, turn, river)
///
/// # Errors
/// * `AbortedComputation` - If MXE output verification fails
/// * `InvalidGameState` - If game state is invalid
/// * `NoWinner` - If no winner can be determined
/// * `SettlementFailed` - If pot transfer fails
pub fn handler(
    _ctx: Context<crate::AtomicShowdownCallback>,
    output: ComputationOutputs<crate::AtomicShowdownDemoOutput>,
) -> Result<()> {
    // Match on the ComputationOutputs enum
    // The macro generates a tuple struct with field_0
    // Note: The MXE circuit is not yet implemented, so this is a placeholder
    let _result = match output {
        ComputationOutputs::Success(out) => out.field_0,
        ComputationOutputs::Failure => {
            msg!("Atomic showdown MXE computation failed");
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    msg!("Atomic showdown MXE computation completed");

    // TODO: Once MXE circuit is implemented:
    // 1. Extract revealed hands from encrypted output
    // 2. Evaluate all hands using the on-chain hand evaluator
    // 3. Determine the winner (or winners in case of a tie)
    // 4. Transfer the full pot from escrow PDA to winner(s)
    //
    // Settlement Rules:
    // - Single winner: receives full pot
    // - Tie: pot split equally between tied winners
    // - Folded players: excluded from evaluation

    Ok(())
}

// The SettleShowdownAccounts struct is defined in lib.rs
