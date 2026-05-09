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

impl arcium_anchor::HasSize for PlaceBetOutput {
    const SIZE: usize = 2; // bool (1 byte) + u8 (1 byte)
}

pub fn handler(
    ctx: Context<crate::PlaceBetCallback>,
    output: SignedComputationOutputs<PlaceBetOutput>,
) -> Result<()> {
    // Verify the MXE output signature — ensures result is authentic
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(out) => out,
        Err(e) => {
            msg!("Place bet MXE output verification failed: {}", e);
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
