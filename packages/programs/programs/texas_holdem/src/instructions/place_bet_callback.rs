use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;
use crate::errors::TexasHoldemError;
use crate::state::PokerTable;

const COMP_DEF_OFFSET_PLACE_BET: u32 = comp_def_offset("place_bet");

/// Output from place_bet MXE instruction.
/// The bet amount is stored as Enc<Mxe, u64> — hidden from all observers.
#[derive(AnchorDeserialize)]
pub struct PlaceBetOutput {
    /// Confirmation that the encrypted bet was stored in MXE state
    pub success: bool,
    /// Player index who placed the bet
    pub player_index: u8,
}

pub fn handler(
    ctx: Context<PlaceBetCallback>,
    output: SignedComputationOutputs<PlaceBetOutput>,
) -> Result<()> {
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

    require!(result.success, TexasHoldemError::AbortedComputation);
    msg!("Bet stored in MXE for player {}", result.player_index);
    Ok(())
}

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
}
