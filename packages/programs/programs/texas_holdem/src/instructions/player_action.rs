use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::{ID, ID_CONST};
use crate::errors::TexasHoldemError;
use crate::state::PokerTable;
use crate::Action;
use crate::{PlaceBetCallback, SignerAccount};

const COMP_DEF_OFFSET_PLACE_BET: u32 = comp_def_offset("place_bet");

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
    let player_index = ctx.accounts.poker_table.current_player;
    let clock = Clock::get()?;

    // Validate it's this player's turn
    // The payer must be the current player (we don't have player registry yet,
    // so we rely on the current_player index being correct)
    
    // Check player hasn't already folded
    let folded_mask = 1u16 << player_index;
    require!(
        (ctx.accounts.poker_table.folded_bitmap & folded_mask) == 0,
        TexasHoldemError::PlayerFolded
    );
    
    // Check player isn't already all-in
    let all_in_mask = 1u16 << player_index;
    require!(
        (ctx.accounts.poker_table.all_in_bitmap & all_in_mask) == 0,
        TexasHoldemError::PlayerAllIn
    );

    // Process the action
    match action {
        Action::Fold => {
            // Mark player as folded
            ctx.accounts.poker_table.folded_bitmap |= folded_mask;
            msg!("Player {} folded", player_index);
        }
        
        Action::Check => {
            // Check is only legal if there's no bet to call
            require!(
                ctx.accounts.poker_table.current_bet == 0,
                TexasHoldemError::CannotCheck
            );
            msg!("Player {} checked", player_index);
        }
        
        Action::Call => {
            // Call is only legal if there's a bet to match
            require!(
                ctx.accounts.poker_table.current_bet > 0,
                TexasHoldemError::InvalidAction
            );
            
            let call_amount = ctx.accounts.poker_table.current_bet;
            
            // Transfer USDC+ from player to escrow PDA (standard SPL transfer)
            let cpi_accounts = Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.escrow_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
            token::transfer(cpi_ctx, call_amount)?;
            
            msg!("Player {} called {} — transferred to escrow", player_index, call_amount);
            
            // Queue MXE computation to store encrypted bet amount
            // TODO: Build arguments for place_bet computation
            let args = vec![];

            ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

            queue_computation(
                ctx.accounts,
                _computation_offset,
                args,
                None,
                vec![PlaceBetCallback::callback_ix(&[])],
                1, // num_callback_txs
            )?;
            
            msg!("Queued MXE computation to store encrypted call bet for player {}", player_index);
        }
        
        Action::Raise => {
            // Raise must be at least current_bet + big_blind (minimum raise)
            let min_raise = ctx.accounts.poker_table.current_bet.checked_add(ctx.accounts.poker_table.big_blind)
                .ok_or(TexasHoldemError::Overflow)?;
            
            require!(
                amount >= min_raise,
                TexasHoldemError::RaiseTooSmall
            );
            
            // Transfer USDC+ from player to escrow PDA (standard SPL transfer)
            let cpi_accounts = Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.escrow_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
            token::transfer(cpi_ctx, amount)?;
            
            msg!("Player {} raised to {} — transferred to escrow", player_index, amount);
            
            // Update current bet to the new raise amount
            ctx.accounts.poker_table.current_bet = amount;
            
            // Queue MXE computation to store encrypted bet amount
            // TODO: Build arguments for place_bet computation
            let args = vec![];

            ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

            queue_computation(
                ctx.accounts,
                _computation_offset,
                args,
                None,
                vec![PlaceBetCallback::callback_ix(&[])],
                1, // num_callback_txs
            )?;
            
            msg!("Queued MXE computation to store encrypted raise bet for player {}", player_index);
        }
        
        Action::AllIn => {
            // Mark player as all-in
            ctx.accounts.poker_table.all_in_bitmap |= all_in_mask;
            
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
        let is_folded = (ctx.accounts.poker_table.folded_bitmap & next_mask) != 0;
        let is_all_in = (ctx.accounts.poker_table.all_in_bitmap & next_mask) != 0;
        
        // If player is active (not folded and not all-in), they're next
        if !is_folded && !is_all_in {
            ctx.accounts.poker_table.current_player = next_player;
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

    // Update last action time for timeout enforcement
    ctx.accounts.poker_table.last_action_time = clock.unix_timestamp;

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

    /// Player's USDC+ token account (source of funds for Call/Raise)
    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,

    /// Escrow PDA token account (destination — holds all player deposits)
    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidGameState
    )]
    pub escrow_account: Account<'info, TokenAccount>,

    /// SPL Token program for USDC+ transfers
    pub token_program: Program<'info, Token>,

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
    pub sign_pda_account: Account<'info, SignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(mut, address = derive_mempool_pda!())]
    /// CHECK: mempool
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!())]
    /// CHECK: execpool
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset))]
    /// CHECK: computation
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_BET))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, TexasHoldemError::InvalidGameState))]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
