use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, ShowdownComplete};

const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = comp_def_offset("atomic_showdown");

/// Output from atomic_showdown MXE instruction.
/// Returns [u8; 12] — up to 6 players × 2 hole cards, all revealed atomically.
/// Fits within the 1232 byte callback limit (12 bytes << 1232).
#[derive(AnchorDeserialize)]
pub struct AtomicShowdownOutput {
    /// All hole card values: [p0_card0, p0_card1, p1_card0, p1_card1, ...]
    pub revealed_hands: [u8; 12],
    /// Number of active (non-folded) players
    pub num_players: u8,
}

pub fn handler(
    ctx: Context<AtomicShowdownCallback>,
    output: SignedComputationOutputs<AtomicShowdownOutput>,
) -> Result<()> {
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(out) => out,
        Err(e) => {
            msg!("Atomic showdown MXE output verification failed: {}", e);
            return Err(CerberusPokerError::AbortedComputation.into());
        }
    };

    let game = &mut ctx.accounts.game_session;

    // Store all revealed hole card values
    for i in 0..(result.num_players as usize * 2) {
        let card_value = result.revealed_hands[i];
        require!(card_value < 52, CerberusPokerError::CardValueOutOfRange);
        require!(
            !game.is_card_value_used(card_value),
            CerberusPokerError::DuplicateCardValue
        );
        game.mark_card_value_used(card_value);
    }

    // Transition to Complete — hand evaluation happens in texas_holdem program
    game.state = GameState::Complete;

    let game_id = game.game_id;
    emit!(ShowdownComplete {
        game_id,
        revealed_hands: result.revealed_hands,
        num_players: result.num_players,
    });

    msg!(
        "Atomic showdown complete for game {}. {} players revealed.",
        game_id,
        result.num_players
    );

    Ok(())
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
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub game_session: Account<'info, GameSession>,
}
