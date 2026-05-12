use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::errors::CerberusPokerError;
use crate::state::{GameSession, GameState, COMMUNITY_CARD, REVEAL_TIMEOUT_SECS};
use crate::RevealCardCallback;
use crate::{ArciumSignerAccount, ID, ID_CONST};

const COMP_DEF_OFFSET_REVEAL_CARD: u32 = comp_def_offset("reveal_card");

/// Queue a reveal_card computation to reveal a community card.
///
/// This instruction queues an MXE computation that performs multi-party
/// threshold decryption to reveal a single community card. All active
/// players must contribute their reveal tokens for the computation to
/// complete successfully.
///
/// The card value will be returned via the reveal_card_callback.
#[inline(never)]
pub fn handler(
    ctx: Context<RevealCard>,
    _game_id: u64,
    card_index: u8,
    computation_offset: u64,
    deck: [u8; 52],
) -> Result<()> {
    let game = &mut ctx.accounts.game_session;

    require!(
        game.state == GameState::Deal
            || game.state == GameState::Active
            || game.state == GameState::Showdown,
        CerberusPokerError::InvalidGameState
    );

    // Validate card index
    require!(
        card_index < game.deck_size,
        CerberusPokerError::CardIndexOutOfRange
    );

    require!(
        !game.is_card_revealed(card_index),
        CerberusPokerError::CardAlreadyRevealed
    );
    require!(
        game.card_assigned_to[card_index as usize] == COMMUNITY_CARD,
        CerberusPokerError::CardNotAssigned
    );

    let player_index = game
        .players
        .iter()
        .take(game.num_players as usize)
        .position(|player| *player == ctx.accounts.payer.key())
        .ok_or(CerberusPokerError::UnauthorizedPlayer)? as u8;

    require!(
        !game.has_player_submitted_reveal(card_index, player_index),
        CerberusPokerError::RevealAlreadySubmitted
    );
    game.mark_player_reveal_submitted(card_index, player_index);

    let clock = Clock::get()?;
    game.reveal_deadline = clock.unix_timestamp + REVEAL_TIMEOUT_SECS;

    if !game.all_players_submitted_reveal(card_index) {
        msg!(
            "Player {} submitted reveal contribution for card {}; waiting for remaining players",
            player_index,
            card_index
        );
        return Ok(());
    }

    // Store the active computation offset for tracking once every player has
    // contributed their reveal token and the MXE reveal can be queued.
    game.active_computation_offset = computation_offset;
    game.pending_reveal_card_index = card_index;

    let mut args = ArgBuilder::new();
    for card in deck.iter() {
        args = args.plaintext_u8(*card);
    }
    let args = args.plaintext_u8(card_index).build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let callback_accounts = vec![CallbackAccount {
        pubkey: ctx.accounts.game_session.key(),
        is_writable: true,
    }];
    let callback_ix = RevealCardCallback::callback_ix(
        computation_offset,
        &ctx.accounts.mxe_account,
        &callback_accounts,
    )?;

    // Queue the computation with callback
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![callback_ix],
        1, // num_callback_txs
        0,
    )?;

    msg!(
        "All reveal contributions received; queued reveal_card computation for card {} (offset: {})",
        card_index,
        computation_offset
    );
    Ok(())
}

#[queue_computation_accounts("reveal_card", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, card_index: u8, computation_offset: u64)]
pub struct RevealCard<'info> {
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
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, CerberusPokerError::InvalidGameState)
    )]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_CARD))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, CerberusPokerError::InvalidGameState)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}
