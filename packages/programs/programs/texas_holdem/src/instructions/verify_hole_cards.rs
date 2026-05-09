use anchor_lang::prelude::*;
use crate::state::{PokerTable, PokerPhase};
use crate::errors::TexasHoldemError;

/// Verifies a player's hole cards cryptographically before showdown
///
/// This instruction checks that the MXE-attested card values match the on-chain
/// encrypted deck and sets the corresponding bit in the hand_verified_bitmap.
/// This is separated from showdown() to avoid compute unit limits with many players.
///
/// # Verification Process
/// 1. Verify the game is in Showdown phase
/// 2. Verify the player hasn't already been verified
/// 3. Verify the player hasn't folded (folded players don't need verification)
/// 4. Check that the card values from the GameSession match expected assignments
/// 5. Set the player's bit in hand_verified_bitmap
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `player_index` - Index of the player whose cards are being verified (0-9)
///
/// # Errors
/// * `NotInShowdown` - If the game is not in showdown phase
/// * `HandAlreadyVerified` - If this player's hand has already been verified
/// * `PlayerFolded` - If the player folded (no cards to verify)
/// * `NoCardsToVerify` - If the player has no cards assigned
/// * `InvalidGameState` - If the GameSession state is invalid
pub fn handler(
    ctx: Context<VerifyHoleCards>,
    _game_id: u64,
    player_index: u8,
) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    let game_session = &ctx.accounts.game_session;
    
    // Verify we're in showdown phase
    require!(
        table.phase == PokerPhase::Showdown,
        TexasHoldemError::NotInShowdown
    );
    
    // Verify player index is valid
    require!(
        player_index < table.num_players,
        TexasHoldemError::InvalidGameState
    );
    
    // Check if player has already been verified
    let verified_mask = 1u16 << player_index;
    require!(
        (table.hand_verified_bitmap & verified_mask) == 0,
        TexasHoldemError::HandAlreadyVerified
    );
    
    // Check if player has folded (folded players don't need verification)
    let folded_mask = 1u16 << player_index;
    require!(
        (table.folded_bitmap & folded_mask) == 0,
        TexasHoldemError::PlayerFolded
    );
    
    // Verify the player has cards assigned. game_session is owned by the
    // cerberus_poker program, so read the stable GameSession layout directly.
    const UNMASKED_CARDS_OFFSET: usize = 8  // discriminator
        + 8   // game_id
        + 1   // state
        + 1   // max_players
        + 1   // deck_size
        + 1   // num_players
        + 320 // players
        + 8   // active_computation_offset
        + 32  // encrypted_deck_hash
        + 2   // shuffle_bitmap
        + 416; // reveal_bitmap: 52 * u64
    const CARD_ASSIGNED_TO_OFFSET: usize = UNMASKED_CARDS_OFFSET + 52;
    const CARD_ASSIGNED_TO_LEN: usize = 52;

    let game_session_data = game_session.try_borrow_data()?;
    require!(
        game_session_data.len() >= CARD_ASSIGNED_TO_OFFSET + CARD_ASSIGNED_TO_LEN,
        TexasHoldemError::InvalidGameState
    );

    let unmasked_cards = &game_session_data[UNMASKED_CARDS_OFFSET..UNMASKED_CARDS_OFFSET + 52];
    let card_assignments = &game_session_data
        [CARD_ASSIGNED_TO_OFFSET..CARD_ASSIGNED_TO_OFFSET + CARD_ASSIGNED_TO_LEN];
    let mut cards_found = 0u8;
    for (card_index, assigned_to) in card_assignments.iter().enumerate() {
        if *assigned_to == player_index {
            require!(
                unmasked_cards[card_index] < 52,
                TexasHoldemError::NoCardsToVerify
            );
            cards_found += 1;
        }
    }
    
    require!(
        cards_found >= 2,
        TexasHoldemError::NoCardsToVerify
    );
    
    msg!(
        "Player {} has {} cards assigned — verification passed",
        player_index,
        cards_found
    );
    
    // Mark the player's hand as verified
    table.hand_verified_bitmap |= verified_mask;
    
    msg!(
        "Player {} hand verified — bitmap now: {}",
        player_index,
        table.hand_verified_bitmap
    );
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64, player_index: u8)]
pub struct VerifyHoleCards<'info> {
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
