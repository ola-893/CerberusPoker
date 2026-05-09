use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use crate::errors::TexasHoldemError;

/// Output from place_bet MXE instruction.
/// The bet amount is stored as Enc<Mxe, u64> — hidden from all observers.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PlaceBetOutput {
    /// Confirmation that the encrypted bet was stored in MXE state
    pub success: bool,
    /// Player index who placed the bet
    pub player_index: u8,
}

pub fn handler(
    ctx: Context<crate::PlaceBetCallback>,
    output: ComputationOutputs<PlaceBetOutput>,
) -> Result<()> {
    // Match on the ComputationOutputs enum
    let result = match output {
        ComputationOutputs::Success(out) => out,
        ComputationOutputs::Failure => {
            msg!("Place bet MXE computation failed");
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    // Verify the computation was successful
    require!(result.success, TexasHoldemError::AbortedComputation);

    // Validate player index is within bounds
    require!(
        result.player_index < 10,
        TexasHoldemError::InvalidGameState
    );

    msg!(
        "Encrypted bet amount stored in MXE state for player {}",
        result.player_index
    );

    // Note: The encrypted bet amount (Enc<Mxe, u64>) is stored in MXE state,
    // not in the PokerTable account. The MXE maintains the mapping:
    // player_index -> Enc<Mxe, u64>
    //
    // At showdown, the MXE will reveal the winner and correct pot distribution
    // based on these encrypted bet amounts.

    Ok(())
}

// The PlaceBetCallbackAccounts struct is defined in lib.rs
