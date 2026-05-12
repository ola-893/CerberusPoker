use crate::errors::TexasHoldemError;
use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub fn handler(
    ctx: Context<crate::PlaceBetCallback>,
    output: ComputationOutputs<crate::PlaceBetOutput>,
) -> Result<()> {
    // Match on the ComputationOutputs enum
    // The macro generates a tuple struct with field_0
    let result = match output {
        ComputationOutputs::Success(out) => out.field_0,
        ComputationOutputs::Failure => {
            msg!("Place bet MXE computation failed");
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    require!(result.field_0, TexasHoldemError::InvalidMxeOutput);

    let table = &ctx.accounts.poker_table;
    if table.num_players > 0 {
        require!(
            result.field_1 < table.num_players,
            TexasHoldemError::InvalidMxeOutput
        );
    } else {
        require!(result.field_1 < 10, TexasHoldemError::InvalidMxeOutput);
    }

    // Note: The encrypted bet amount (Enc<Mxe, u64>) is stored in MXE state,
    // not in the PokerTable account. The MXE maintains the mapping:
    // player_index -> Enc<Mxe, u64>
    msg!(
        "Place bet MXE computation completed for player {}",
        result.field_1
    );

    Ok(())
}

// The PlaceBetCallbackAccounts struct is defined in lib.rs
