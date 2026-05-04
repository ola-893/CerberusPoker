use anchor_lang::prelude::*;
use crate::state::{PokerTable, PokerPhase};
use crate::errors::TexasHoldemError;
use crate::hand_eval::{evaluate_hand, HandRank, Tiebreaker};

/// Evaluates all non-folded players' hands and determines the winner(s)
///
/// This instruction requires all non-folded players to have their hands verified
/// via verify_hole_cards before it can proceed. It evaluates each player's best
/// 5-card hand from their 2 hole cards + 5 community cards, determines the winner,
/// and prepares for pot settlement.
///
/// # Requirements
/// 1. Game must be in Showdown phase
/// 2. All non-folded players must have hand_verified_bitmap bit set
/// 3. Community cards must be revealed (5 cards in unmasked_cards)
///
/// # Process
/// 1. Verify all non-folded players have verified hands
/// 2. For each non-folded player:
///    a. Get their 2 hole cards from game_session
///    b. Get the 5 community cards from game_session
///    c. Evaluate their best 5-card hand
/// 3. Compare all hands to determine winner(s)
/// 4. Store winner information for pot settlement
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
///
/// # Errors
/// * `NotInShowdown` - If the game is not in showdown phase
/// * `NotAllHandsVerified` - If any non-folded player hasn't been verified
/// * `NoWinner` - If no active players remain (all folded)
/// * `InvalidGameState` - If game state is inconsistent
pub fn handler(ctx: Context<Showdown>, _game_id: u64) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    let game_session = &ctx.accounts.game_session;
    
    // Verify we're in showdown phase
    require!(
        table.phase == PokerPhase::Showdown,
        TexasHoldemError::NotInShowdown
    );
    
    // Find all non-folded players
    let mut active_players = Vec::new();
    for player_index in 0..10 {
        let folded_mask = 1u16 << player_index;
        if (table.folded_bitmap & folded_mask) == 0 {
            active_players.push(player_index);
        }
    }
    
    // Verify at least one player is active
    require!(
        !active_players.is_empty(),
        TexasHoldemError::NoWinner
    );
    
    // If only one player remains, they win by default
    if active_players.len() == 1 {
        msg!("Player {} wins by default (all others folded)", active_players[0]);
        // In a full implementation, we would trigger pot settlement here
        return Ok(());
    }
    
    // Verify all active players have verified hands
    for &player_index in &active_players {
        let verified_mask = 1u16 << player_index;
        require!(
            (table.hand_verified_bitmap & verified_mask) != 0,
            TexasHoldemError::NotAllHandsVerified
        );
    }
    
    msg!("Evaluating hands for {} active players", active_players.len());
    
    // In a full implementation, we would:
    // 1. Read each player's hole cards from game_session.card_assigned_to and unmasked_cards
    // 2. Read the 5 community cards from game_session.unmasked_cards
    // 3. Evaluate each player's hand using evaluate_hand()
    // 4. Compare hands to determine winner(s)
    // 5. Store winner information for pot settlement
    //
    // For now, we demonstrate the evaluation logic with placeholder data
    
    // Example: Evaluate a sample hand
    // In reality, we'd read these from game_session
    let sample_hand = [0u8, 1, 2, 3, 4, 5, 6]; // 7 cards (2 hole + 5 community)
    let (rank, tiebreaker) = evaluate_hand(&sample_hand);
    
    msg!(
        "Sample hand evaluation: rank={:?}, tiebreaker={:?}",
        rank,
        tiebreaker
    );
    
    // Compare all hands and determine winner
    // In a full implementation, we would:
    // - Build a Vec<(player_index, HandRank, Tiebreaker)>
    // - Sort by (HandRank, Tiebreaker) descending
    // - Find all players with the best hand (handle ties)
    // - Store winner(s) for pot settlement
    
    msg!("Showdown complete — winner determination logic placeholder");
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct Showdown<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,
    
    /// The GameSession PDA from cerberus_poker program
    /// Contains card assignments and revealed card values
    /// CHECK: We read card_assigned_to and unmasked_cards from this account
    #[account(
        constraint = game_session.key() == poker_table.game_session @ TexasHoldemError::InvalidGameState
    )]
    pub game_session: UncheckedAccount<'info>,
    
    pub caller: Signer<'info>,
}
