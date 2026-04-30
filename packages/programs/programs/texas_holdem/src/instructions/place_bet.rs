use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;
use crate::errors::TexasHoldemError;
use crate::state::PokerTable;

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
    let table = &ctx.accounts.poker_table;

    // Validate player index is within bounds
    require!(
        player_index < 10,
        TexasHoldemError::InvalidGameState
    );

    // Transfer USDC+ from player to escrow PDA (standard SPL transfer)
    let cpi_accounts = Transfer {
        from: ctx.accounts.player_token_account.to_account_info(),
        to: ctx.accounts.escrow_account.to_account_info(),
        authority: ctx.accounts.player.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    
    msg!("Transferred {} USDC+ from player {} to escrow", amount, player_index);

    // Queue MXE computation to store encrypted bet amount
    // The MXE will store Enc<Mxe, u64> — hidden from all observers
    // The callback (place_bet_callback) will confirm the encrypted bet was stored
    
    let args = ArgBuilder::new()
        .add_u64(amount)
        .add_u8(player_index)
        .build();

    queue_computation(
        &ctx.accounts.arcium_program,
        &ctx.accounts.sign_pda_account,
        &ctx.accounts.mxe_account,
        &ctx.accounts.mempool_account,
        &ctx.accounts.executing_pool,
        &ctx.accounts.computation_account,
        &ctx.accounts.comp_def_account,
        &ctx.accounts.cluster_account,
        &ctx.accounts.pool_account,
        &ctx.accounts.clock_account,
        &ctx.accounts.address_lookup_table,
        &ctx.accounts.lut_program,
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        computation_offset,
        args,
    )?;

    msg!("Queued MXE computation to store encrypted bet for player {}", player_index);
    Ok(())
}

#[queue_computation_accounts("place_bet", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, amount: u64, player_index: u8, computation_offset: u64)]
pub struct PlaceBet<'info> {
    /// The PokerTable PDA for this game
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,

    /// Player's USDC+ token account (source of funds)
    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,

    /// Escrow PDA token account (destination — holds all player deposits)
    /// This is a standard SPL token account that holds USDC+ during the game
    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidGameState
    )]
    pub escrow_account: Account<'info, TokenAccount>,

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

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_BET))]
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
