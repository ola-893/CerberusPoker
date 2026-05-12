use crate::errors::TexasHoldemError;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

/// Verify the MXE-attested atomic showdown reveal.
///
/// This instruction is triggered by the `atomic_showdown_demo` callback from the MXE.
/// It performs the following:
/// 1. Confirms the computation succeeded
/// 2. Validates revealed hole-card values are in range
/// 3. Marks non-folded hands as verified for the settlement instruction
///
/// Pot settlement is handled by `showdown`, which has the GameSession account
/// and winner token accounts needed to evaluate hands and transfer escrow funds.
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `community_cards` - The 5 community cards (flop, turn, river)
///
/// # Errors
/// * `AbortedComputation` - If MXE computation failed
/// * `InvalidMxeOutput` - If any revealed card value is out of range
pub fn handler(
    ctx: Context<crate::AtomicShowdownDemoCallback>,
    output: ComputationOutputs<crate::AtomicShowdownDemoOutput>,
) -> Result<()> {
    // Match on the ComputationOutputs enum
    // The macro generates a tuple struct with field_0
    let revealed_hands = match output {
        ComputationOutputs::Success(out) => out.field_0,
        ComputationOutputs::Failure => {
            msg!("Atomic showdown MXE computation failed");
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    let table = &mut ctx.accounts.poker_table;
    let cards_to_validate = (table.num_players as usize).saturating_mul(2).min(12);
    for card_value in revealed_hands.iter().take(cards_to_validate) {
        require!(*card_value < 52, TexasHoldemError::InvalidMxeOutput);
    }

    for player_index in 0..table.num_players {
        if !table.is_folded(player_index) {
            table.hand_verified_bitmap |= 1u16 << player_index;
        }
    }

    msg!(
        "Atomic showdown MXE computation completed; verified {} revealed hole cards",
        cards_to_validate
    );

    Ok(())
}

// The SettleShowdownAccounts struct is defined in lib.rs
