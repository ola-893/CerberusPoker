use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::{ID, ID_CONST};
use crate::errors::TexasHoldemError;
use crate::state::PokerTable;
use crate::{PlaceBetCallback, SignerAccount};

const COMP_DEF_OFFSET_PLACE_BET: u32 = comp_def_offset("place_bet");

/// Place a bet: transfer USDC+ to escrow, queue MXE computation to store Enc<Mxe, u64> bet amount
///
/// This instruction implements Phase 1 of the wager module:
/// 1. Transfers USDC+ from player's token account to the escrow PDA (standard SPL transfer)
/// 2. Queues an MXE computation to store the encrypted bet amount as Enc<Mxe, u64>
///
/// The bet amount is visible on-chain as a plaintext SPL transfer, but the MXE stores
/// the encrypted amount hidden from all observers. At showdown, the MXE reveals the
/// winner and correct pot distribution.
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `amount` - Bet amount in USDC+ tokens (lamports)
/// * `player_index` - Index of the player placing the bet (0-9)
/// * `computation_offset` - Unique offset for MXE computation (random u64)
///
/// # Errors
/// * `InsufficientBalance` - If player's token account has insufficient funds
/// * `InvalidGameState` - If MXE accounts are invalid
/// * `Overflow` - If arithmetic operations overflow
pub fn handler(
    ctx: Context<PlaceBet>,
    _game_id: u64,
    amount: u64,
    player_index: u8,
    computation_offset: u64,
) -> Result<()> {
    {
        let table = &mut ctx.accounts.poker_table;

        require!(player_index < 10, TexasHoldemError::InvalidGameState);
        if table.num_players > 0 {
            require!(player_index < table.num_players, TexasHoldemError::InvalidGameState);
        }
        require!(
            ctx.accounts.player_token_account.owner == ctx.accounts.player.key(),
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

        table.player_round_bets[player_index as usize] = table.player_round_bets[player_index as usize]
            .checked_add(amount)
            .ok_or(TexasHoldemError::Overflow)?;
        table.pot_total = table.pot_total
            .checked_add(amount)
            .ok_or(TexasHoldemError::Overflow)?;
    }

    let cpi_accounts = Transfer {
        from: ctx.accounts.player_token_account.to_account_info(),
        to: ctx.accounts.escrow_account.to_account_info(),
        authority: ctx.accounts.player.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

    token::transfer(cpi_ctx, amount)?;

    msg!("Transferred {} USDC+ from player {} to escrow", amount, player_index);

    // Queue MXE computation to store encrypted bet amount
    // The MXE will store Enc<Mxe, u64> — hidden from all observers
    // The callback (place_bet_callback) will confirm the encrypted bet was stored
    
    // TODO: Build arguments for place_bet computation
    // In 0.4.0, arguments are Vec<Argument> from arcium_client::idl::arcium::types
    let args = vec![];

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![PlaceBetCallback::callback_ix(&[])],
        1, // num_callback_txs
    )?;

    msg!("Queued MXE computation to store encrypted bet for player {}", player_index);
    Ok(())
}

#[queue_computation_accounts("place_bet", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, amount: u64, player_index: u8, computation_offset: u64)]
pub struct PlaceBet<'info> {
    /// The PokerTable PDA for this game (boxed to reduce stack frame size)
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Box<Account<'info, PokerTable>>,

    /// Player's USDC+ token account (source of funds) - boxed to reduce stack
    #[account(mut)]
    pub player_token_account: Box<Account<'info, TokenAccount>>,

    /// Escrow PDA token account (destination — holds all player deposits)
    /// This is a standard SPL token account that holds USDC+ during the game
    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidGameState
    )]
    pub escrow_account: Box<Account<'info, TokenAccount>>,

    /// Player placing the bet (must sign the transaction)
    #[account(mut)]
    pub player: Signer<'info>,

    /// Payer for MXE computation fees
    #[account(mut)]
    pub payer: Signer<'info>,

    /// SPL Token program for USDC+ transfer
    pub token_program: Program<'info, Token>,

    // ─── Arcium MXE Accounts ──────────────────────────────────────────────────
    // These accounts are required for queue_computation() to work
    // The #[queue_computation_accounts] macro generates most of these constraints

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
