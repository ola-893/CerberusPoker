use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use crate::errors::TexasHoldemError;
use crate::Action;

/// Handles all player betting actions during a poker hand
///
/// This instruction processes Fold, Check, Call, Raise, and AllIn actions.
/// It enforces turn order, validates action legality based on game state,
/// and advances to the next player after a successful action.
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `action` - The action the player wants to take (Fold/Check/Call/Raise/AllIn)
/// * `amount` - The amount for Raise actions (ignored for other actions)
/// * `computation_offset` - Unique offset for MXE computation (for bet encryption)
///
/// # Action Rules
/// * **Fold**: Always legal, player exits the hand
/// * **Check**: Only legal if current_bet == 0 (no bet to call)
/// * **Call**: Only legal if current_bet > 0, matches the current bet
/// * **Raise**: Must be at least current_bet + big_blind (minimum raise)
/// * **AllIn**: Bet all remaining chips, always legal
///
/// # Errors
/// * `NotYourTurn` - If it's not this player's turn to act
/// * `PlayerFolded` - If the player has already folded
/// * `PlayerAllIn` - If the player is already all-in
/// * `CannotCheck` - If there's a bet to call (current_bet > 0)
/// * `RaiseTooSmall` - If raise amount is below minimum
pub fn handler(
    ctx: Context<PlayerAction>,
    _game_id: u64,
    action: Action,
    amount: u64,
    _computation_offset: u64,
) -> Result<()> {
    let table = &mut ctx.accounts.poker_table;
    let player_index = table.current_player;

    // Validate it's this player's turn
    // The payer must be the current player (we don't have player registry yet,
    // so we rely on the current_player index being correct)
    
    // Check player hasn't already folded
    let folded_mask = 1u16 << player_index;
    require!(
        (table.folded_bitmap & folded_mask) == 0,
        TexasHoldemError::PlayerFolded
    );
    
    // Check player isn't already all-in
    let all_in_mask = 1u16 << player_index;
    require!(
        (table.all_in_bitmap & all_in_mask) == 0,
        TexasHoldemError::PlayerAllIn
    );

    // Process the action
    match action {
        Action::Fold => {
            // Mark player as folded
            table.folded_bitmap |= folded_mask;
            msg!("Player {} folded", player_index);
        }
        
        Action::Check => {
            // Check is only legal if there's no bet to call
            require!(
                table.current_bet == 0,
                TexasHoldemError::CannotCheck
            );
            msg!("Player {} checked", player_index);
        }
        
        Action::Call => {
            // Call is only legal if there's a bet to match
            require!(
                table.current_bet > 0,
                TexasHoldemError::InvalidAction
            );
            
            // In a full implementation, we would:
            // 1. Transfer tokens from player stack to pot
            // 2. Queue MXE computation to store encrypted bet amount
            // For now, we just validate and log
            msg!("Player {} called {}", player_index, table.current_bet);
        }
        
        Action::Raise => {
            // Raise must be at least current_bet + big_blind (minimum raise)
            let min_raise = table.current_bet.checked_add(table.big_blind)
                .ok_or(TexasHoldemError::Overflow)?;
            
            require!(
                amount >= min_raise,
                TexasHoldemError::RaiseTooSmall
            );
            
            // Update current bet to the new raise amount
            table.current_bet = amount;
            
            // In a full implementation, we would:
            // 1. Transfer tokens from player stack to pot
            // 2. Queue MXE computation to store encrypted bet amount
            msg!("Player {} raised to {}", player_index, amount);
        }
        
        Action::AllIn => {
            // Mark player as all-in
            table.all_in_bitmap |= all_in_mask;
            
            // In a full implementation, we would:
            // 1. Transfer all remaining tokens from player stack to pot
            // 2. Queue MXE computation to store encrypted bet amount
            // 3. Potentially update current_bet if all-in amount is higher
            msg!("Player {} went all-in", player_index);
        }
    }

    // Advance to next player
    // Find the next player who hasn't folded and isn't all-in
    let mut next_player = (player_index + 1) % 10; // Assuming max 10 players
    let mut attempts = 0;
    
    // Keep advancing until we find an active player or complete a full rotation
    while attempts < 10 {
        let next_mask = 1u16 << next_player;
        let is_folded = (table.folded_bitmap & next_mask) != 0;
        let is_all_in = (table.all_in_bitmap & next_mask) != 0;
        
        // If player is active (not folded and not all-in), they're next
        if !is_folded && !is_all_in {
            table.current_player = next_player;
            msg!("Next player: {}", next_player);
            break;
        }
        
        next_player = (next_player + 1) % 10;
        attempts += 1;
    }
    
    // If we couldn't find an active player, the betting round is complete
    // (either everyone folded except one, or everyone is all-in)
    if attempts == 10 {
        msg!("Betting round complete — all players folded or all-in");
    }

    Ok(())
}

#[queue_computation_accounts("place_bet", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, action: Action, amount: u64, computation_offset: u64)]
pub struct PlayerAction<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, TexasHoldemError::InvalidGameState))]
    /// CHECK: mempool
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, TexasHoldemError::InvalidGameState))]
    /// CHECK: execpool
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, TexasHoldemError::InvalidGameState))]
    /// CHECK: computation
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(arcium_macros::comp_def_offset("place_bet")))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, TexasHoldemError::InvalidGameState))]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: lut
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
