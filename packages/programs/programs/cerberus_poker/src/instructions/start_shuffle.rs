use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, ShuffleStarted, SHUFFLE_TIMEOUT_SECS};
use crate::ShuffleDeckCallback;
use crate::{ArciumSignerAccount, ID, ID_CONST};

const COMP_DEF_OFFSET_SHUFFLE_DECK: u32 = comp_def_offset("shuffle_deck");

#[inline(never)]
pub fn handler(ctx: Context<StartShuffle>, game_id: u64, computation_offset: u64) -> Result<()> {
    let game = &mut ctx.accounts.game_session;

    // Must be in Lobby with enough players
    require!(
        game.state == GameState::Lobby,
        CerberusPokerError::InvalidGameState
    );
    require!(game.num_players >= 2, CerberusPokerError::NotEnoughPlayers);

    // Transition to Shuffle phase
    let clock = Clock::get()?;
    game.state = GameState::Shuffle;
    game.active_computation_offset = computation_offset;
    game.shuffle_deadline = clock.unix_timestamp + SHUFFLE_TIMEOUT_SECS;

    // Build the encrypted deck input for the MXE.
    // The initial deck [0, 1, 2, ..., 51] is passed as Enc<Mxe, [u8; 52]>.
    // The MXE will shuffle it and return the shuffled deck via callback.
    //
    // ArgBuilder pattern (from Arcium docs):
    // - For Enc<Mxe, T>: pass nonce + ciphertext (no pubkey needed)
    // - The client encrypts the initial deck with the MXE's public key
    //   before calling this instruction
    // TODO: Build arguments for shuffle_deck computation once the frontend
    // passes encrypted deck input. Keep a valid empty ArgumentList for now.
    let args = ArgBuilder::new().build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let callback_accounts = vec![CallbackAccount {
        pubkey: ctx.accounts.game_session.key(),
        is_writable: true,
    }];
    let callback_ix = ShuffleDeckCallback::callback_ix(
        computation_offset,
        &ctx.accounts.mxe_account,
        &callback_accounts,
    )?;

    // Queue the shuffle_deck computation on the Arcium MXE
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![callback_ix],
        1, // num_callback_txs
        0,
    )?;

    emit!(ShuffleStarted {
        game_id,
        computation_offset,
    });

    msg!(
        "Shuffle started for game {}, computation offset: {}",
        game_id,
        computation_offset
    );
    Ok(())
}

#[queue_computation_accounts("shuffle_deck", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, computation_offset: u64)]
pub struct StartShuffle<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    pub game_session: Box<Account<'info, GameSession>>,

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
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

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
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    // Placeholder accounts for encrypted deck input
    // In practice the client passes the encrypted deck ciphertext
    /// CHECK: nonce for encryption
    pub nonce: UncheckedAccount<'info>,
    /// CHECK: encrypted deck ciphertext chunk 0
    pub deck_ciphertext_0: UncheckedAccount<'info>,
}
