use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, ShuffleStarted, SHUFFLE_TIMEOUT_SECS};

const COMP_DEF_OFFSET_SHUFFLE_DECK: u32 = comp_def_offset("shuffle_deck_demo");

pub fn handler(
    ctx: Context<StartShuffle>,
    game_id: u64,
    computation_offset: u64,
) -> Result<()> {
    let game = &mut ctx.accounts.game_session;

    // Must be in Lobby with enough players
    require!(game.state == GameState::Lobby, CerberusPokerError::InvalidGameState);
    require!(game.num_players >= 2, CerberusPokerError::NotEnoughPlayers);

    // Transition to Shuffle phase
    let clock = Clock::get()?;
    game.state = GameState::Shuffle;
    game.active_computation_offset = computation_offset;
    game.shuffle_deadline = clock.unix_timestamp + SHUFFLE_TIMEOUT_SECS;
    game.bump = ctx.bumps.game_session;

    // Build the encrypted deck input for the MXE.
    // The initial deck [0, 1, 2, ..., 51] is passed as Enc<Mxe, [u8; 52]>.
    // The MXE will shuffle it and return the shuffled deck via callback.
    //
    // ArgBuilder pattern (from Arcium docs):
    // - For Enc<Mxe, T>: pass nonce + ciphertext (no pubkey needed)
    // - The client encrypts the initial deck with the MXE's public key
    //   before calling this instruction
    let args = ArgBuilder::new()
        .plaintext_u128(ctx.accounts.nonce.key().to_bytes()[..16].try_into().unwrap())
        .encrypted_u8(ctx.accounts.deck_ciphertext_0.key().to_bytes())
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Queue the shuffle_deck computation on the Arcium MXE
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![ShuffleDeckCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1, // num_callback_txs
        0, // cu_price_micro (no priority fee)
    )?;

    emit!(ShuffleStarted {
        game_id,
        computation_offset,
    });

    msg!("Shuffle started for game {}, computation offset: {}", game_id, computation_offset);
    Ok(())
}

#[queue_computation_accounts("shuffle_deck_demo", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, computation_offset: u64)]
pub struct StartShuffle<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    pub game_session: Account<'info, GameSession>,

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

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SHUFFLE_DECK))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,

    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,

    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,

    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    // Placeholder accounts for encrypted deck input
    // In practice the client passes the encrypted deck ciphertext
    /// CHECK: nonce for encryption
    pub nonce: UncheckedAccount<'info>,
    /// CHECK: encrypted deck ciphertext chunk 0
    pub deck_ciphertext_0: UncheckedAccount<'info>,
}
