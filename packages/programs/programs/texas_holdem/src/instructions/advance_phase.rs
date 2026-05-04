use anchor_lang::prelude::*;
use crate::state::{PokerTable, PokerPhase};
use crate::errors::TexasHoldemError;

/// Advances the poker table through phases: PreFlop → Flop → Turn → River → Showdown
///
/// This instruction transitions the table to the next phase. When transitioning to
/// Flop, Turn, or River, the client must separately call cerberus_poker's `reveal_card`
/// instruction to trigger community card reveals via MXE CPI.
///
/// # Phase Transitions and Community Cards
/// - **PreFlop → Flop**: Client should reveal 3 community cards (indices 0, 1, 2)
/// - **Flop → Turn**: Client should reveal 1 community card (index 3)
/// - **Turn → River**: Client should reveal 1 community card (index 4)
/// - **River → Showdown**: No community cards to reveal
///
/// The separation of phase advancement and card reveals allows for:
/// 1. Flexible timing of reveals (can be done before or after phase transition)
/// 2. Parallel reveal operations for multiple cards
/// 3. Better error handling (phase transition succeeds even if reveals fail)
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
///
/// # Errors
/// * `InvalidPhase` - If trying to advance from an invalid phase
/// * `CannotAdvancePhase` - If betting round is not complete (future validation)
pub fn handler(ctx: Context<AdvancePhase>, _game_id: u64) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    
    // Determine the next phase and log which community cards should be revealed
    let (next_phase, cards_to_reveal_msg) = match table.phase {
        PokerPhase::PreFlop => {
            (PokerPhase::Flop, "Client should reveal 3 community cards (indices 0, 1, 2)")
        }
        PokerPhase::Flop => {
            (PokerPhase::Turn, "Client should reveal 1 community card (index 3)")
        }
        PokerPhase::Turn => {
            (PokerPhase::River, "Client should reveal 1 community card (index 4)")
        }
        PokerPhase::River => {
            (PokerPhase::Showdown, "No community cards to reveal")
        }
        PokerPhase::Showdown => {
            // Already in showdown, no phase change
            msg!("Already in showdown phase");
            return Ok(());
        }
    };

    // Update the phase
    table.phase = next_phase.clone();
    
    msg!("Phase advanced to {:?}", next_phase);
    msg!("Community cards: {}", cards_to_reveal_msg);

    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct AdvancePhase<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,
    
    pub caller: Signer<'info>,
}
