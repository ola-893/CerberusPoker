use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use crate::errors::TexasHoldemError;

pub fn handler(
    _ctx: Context<crate::PlaceBetCallback>,
    output: ComputationOutputs<crate::PlaceBetOutput>,
) -> Result<()> {
    // Match on the ComputationOutputs enum
    // The macro generates a tuple struct with field_0
    // Note: The MXE circuit is not yet implemented, so this is a placeholder
    let _result = match output {
        ComputationOutputs::Success(out) => out.field_0,
        ComputationOutputs::Failure => {
            msg!("Place bet MXE computation failed");
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    msg!("Place bet MXE computation completed");

    // Note: The encrypted bet amount (Enc<Mxe, u64>) is stored in MXE state,
    // not in the PokerTable account. The MXE maintains the mapping:
    // player_index -> Enc<Mxe, u64>
    //
    // At showdown, the MXE will reveal the winner and correct pot distribution
    // based on these encrypted bet amounts.
    //
    // TODO: Once MXE circuit is implemented, extract actual data from encrypted output

    Ok(())
}

// The PlaceBetCallbackAccounts struct is defined in lib.rs
