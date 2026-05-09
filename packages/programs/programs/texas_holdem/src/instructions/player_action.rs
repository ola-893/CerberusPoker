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
    computation_offset: u64,
) -> Result<()> {
    let player_index = ctx.accounts.poker_table.current_player;
    let clock = Clock::get()?;
    let mut queue_bet_computation = false;

    {
        let table = &mut ctx.accounts.poker_table;

        require!(table.num_players >= 2, TexasHoldemError::NotEnoughPlayers);
        require!(player_index < table.num_players, TexasHoldemError::NotYourTurn);
        require!(
            ctx.accounts.player_token_account.owner == ctx.accounts.payer.key(),
            TexasHoldemError::InvalidStackAccount
        );
        require!(
            ctx.accounts.player_token_account.mint == ctx.accounts.escrow_account.mint,
            TexasHoldemError::InvalidPotAccount
        );

        let expected_stack = table.player_stacks[player_index as usize];
        if expected_stack == Pubkey::default() {
            table.player_stacks[player_index as usize] = ctx.accounts.player_token_account.key();
        } else {
            require!(
                expected_stack == ctx.accounts.player_token_account.key(),
                TexasHoldemError::InvalidStackAccount
            );
        }

        let folded_mask = 1u16 << player_index;
        require!((table.folded_bitmap & folded_mask) == 0, TexasHoldemError::PlayerFolded);

        let all_in_mask = 1u16 << player_index;
        require!((table.all_in_bitmap & all_in_mask) == 0, TexasHoldemError::PlayerAllIn);

        let mut transfer_amount = 0u64;
        let current_player_bet = table.player_round_bets[player_index as usize];

        match action {
            Action::Fold => {
                table.folded_bitmap |= folded_mask;
                table.mark_acted(player_index);
                msg!("Player {} folded", player_index);
            }

            Action::Check => {
                require!(
                    current_player_bet == table.current_bet,
                    TexasHoldemError::CannotCheck
                );
                table.mark_acted(player_index);
                msg!("Player {} checked", player_index);
            }

            Action::Call => {
                require!(table.current_bet > current_player_bet, TexasHoldemError::InvalidAction);
                transfer_amount = table.current_bet
                    .checked_sub(current_player_bet)
                    .ok_or(TexasHoldemError::Underflow)?;
                table.player_round_bets[player_index as usize] = table.current_bet;
                table.mark_acted(player_index);
                msg!("Player {} called {}", player_index, transfer_amount);
            }

            Action::Raise => {
                require!(amount > table.current_bet, TexasHoldemError::RaiseTooSmall);
                let raise_delta = amount
                    .checked_sub(table.current_bet)
                    .ok_or(TexasHoldemError::Underflow)?;
                require!(raise_delta >= table.last_raise, TexasHoldemError::RaiseTooSmall);
                transfer_amount = amount
                    .checked_sub(current_player_bet)
                    .ok_or(TexasHoldemError::Underflow)?;
                table.current_bet = amount;
                table.last_raise = raise_delta;
                table.player_round_bets[player_index as usize] = amount;
                table.acted_bitmap = 0;
                table.mark_acted(player_index);
                msg!("Player {} raised to {}", player_index, amount);
            }

            Action::AllIn => {
                require!(amount > current_player_bet, TexasHoldemError::InvalidAction);
                transfer_amount = amount
                    .checked_sub(current_player_bet)
                    .ok_or(TexasHoldemError::Underflow)?;

                if amount > table.current_bet {
                    let raise_delta = amount
                        .checked_sub(table.current_bet)
                        .ok_or(TexasHoldemError::Underflow)?;
                    table.current_bet = amount;
                    if raise_delta >= table.last_raise {
                        table.last_raise = raise_delta;
                        table.acted_bitmap = 0;
                    }
                }

                table.player_round_bets[player_index as usize] = amount;
                table.all_in_bitmap |= all_in_mask;
                table.mark_acted(player_index);
                msg!("Player {} went all-in for {}", player_index, amount);
            }
        }

        if transfer_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.escrow_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
            token::transfer(cpi_ctx, transfer_amount)?;

            table.pot_total = table.pot_total
                .checked_add(transfer_amount)
                .ok_or(TexasHoldemError::Overflow)?;
            queue_bet_computation = true;
        }

        if table.betting_round_complete() {
            msg!("Betting round complete");
        } else if let Some(next_player) = table.next_action_player(player_index) {
            table.current_player = next_player;
            msg!("Next player: {}", next_player);
        }

        table.last_action_time = clock.unix_timestamp;
    }

    if queue_bet_computation {
        let args = vec![];

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![PlaceBetCallback::callback_ix(&[])],
            1,
        )?;

        msg!("Queued MXE computation to store encrypted bet for player {}", player_index);
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
    pub poker_table: Box<Account<'info, PokerTable>>,

    /// Player's USDC+ token account (source of funds for Call/Raise)
    #[account(mut)]
    pub player_token_account: Box<Account<'info, TokenAccount>>,

    /// Escrow PDA token account (destination — holds all player deposits)
    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidGameState
    )]
    pub escrow_account: Box<Account<'info, TokenAccount>>,

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
    pub sign_pda_account: Box<Account<'info, SignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

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
