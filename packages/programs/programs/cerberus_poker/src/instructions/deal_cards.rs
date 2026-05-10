use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::errors::CerberusPokerError;
use crate::state::{
    CardDealt, GameSession, GameState, COMMUNITY_CARD, REVEAL_TIMEOUT_SECS, UNASSIGNED,
};
use crate::DealCardToRecipientCallback;
use crate::{ArciumSignerAccount, ID, ID_CONST};

const COMP_DEF_OFFSET_DEAL_CARD: u32 = comp_def_offset("deal_card_to_recipient");

#[inline(never)]
pub fn handler(
    ctx: Context<DealCards>,
    game_id: u64,
    assignments: Vec<(u8, u8)>, // (card_index, player_index)
    computation_offset: u64,
) -> Result<()> {
    let game = &mut ctx.accounts.game_session;

    require!(
        game.state == GameState::Deal,
        CerberusPokerError::InvalidGameState
    );

    // Record card assignments
    for (card_index, player_index) in &assignments {
        require!(
            *card_index < game.deck_size,
            CerberusPokerError::CardIndexOutOfRange
        );
        require!(
            *player_index < game.num_players || *player_index == COMMUNITY_CARD,
            CerberusPokerError::PlayerNotFound
        );
        require!(
            game.card_assigned_to[*card_index as usize] == UNASSIGNED,
            CerberusPokerError::CardAlreadyRevealed
        );

        game.card_assigned_to[*card_index as usize] = *player_index;

        emit!(CardDealt {
            game_id,
            card_index: *card_index,
            player_index: *player_index,
        });
    }

    game.active_computation_offset = computation_offset;

    // Set reveal deadline for timeout enforcement
    // This allows timeout_reveal to be called if card dealing stalls
    let clock = Clock::get()?;
    game.reveal_deadline = clock.unix_timestamp + REVEAL_TIMEOUT_SECS;

    // Queue deal_card_to_recipient computation for the first assigned card.
    // The MXE will perform threshold decryption to reveal the card value
    // to the specific recipient.
    //
    // Arguments for deal_card_to_recipient(card: Enc<Mxe, EncryptedCard>, card_index: u8):
    // - Encrypted card from the shuffled deck (Enc<Mxe, EncryptedCard>)
    // - Card index (plaintext u8)
    //
    // The encrypted deck is passed via the encrypted_card_c1 and encrypted_card_c2 accounts
    // which contain the ElGamal ciphertext (C1, C2) for the card at the specified index.
    let first_dealt_card = assignments
        .iter()
        .find(|(_, player_index)| *player_index != COMMUNITY_CARD);

    let Some((first_card_index, first_player_index)) = first_dealt_card else {
        msg!("Recorded community card assignments; no private deal computation queued");
        return Ok(());
    };
    game.pending_deal_card_index = *first_card_index;
    game.pending_deal_player_index = *first_player_index;

    let required_hole_cards = (game.num_players as usize).saturating_mul(2);
    let assigned_hole_cards = game
        .card_assigned_to
        .iter()
        .filter(|assigned_to| **assigned_to < game.num_players)
        .count();
    if assigned_hole_cards >= required_hole_cards {
        game.state = GameState::Active;
    }

    // TODO: Build arguments for deal_card_to_recipient once encrypted card
    // inputs are wired through. Keep a valid empty ArgumentList for now.
    let args = ArgBuilder::new().build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let game_session_key = ctx.accounts.game_session.key();
    let dealt_card = Pubkey::find_program_address(
        &[
            b"dealt_card",
            game_session_key.as_ref(),
            &[*first_player_index],
            &[*first_card_index],
        ],
        &crate::ID,
    )
    .0;
    let callback_accounts = vec![
        CallbackAccount {
            pubkey: game_session_key,
            is_writable: true,
        },
        CallbackAccount {
            pubkey: dealt_card,
            is_writable: true,
        },
        CallbackAccount {
            pubkey: ctx.accounts.payer.key(),
            is_writable: true,
        },
        CallbackAccount {
            pubkey: ctx.accounts.system_program.key(),
            is_writable: false,
        },
    ];
    let callback_ix = DealCardToRecipientCallback::callback_ix(
        computation_offset,
        &ctx.accounts.mxe_account,
        &callback_accounts,
    )?;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![callback_ix],
        1,
        0,
    )?;

    msg!(
        "Queued deal_card_to_recipient computation for card {} (offset: {})",
        first_card_index,
        computation_offset
    );
    Ok(())
}

#[queue_computation_accounts("deal_card_to_recipient", payer)]
#[derive(Accounts)]
#[instruction(game_id: u64, assignments: Vec<(u8, u8)>, computation_offset: u64)]
pub struct DealCards<'info> {
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

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEAL_CARD))]
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

    // Encrypted card input for deal_card_to_recipient MXE instruction
    // The card is represented as an ElGamal ciphertext (C1, C2)
    /// CHECK: encrypted_card_c1 - first component of ElGamal ciphertext
    pub encrypted_card_c1: UncheckedAccount<'info>,
    /// CHECK: encrypted_card_c2 - second component of ElGamal ciphertext
    pub encrypted_card_c2: UncheckedAccount<'info>,
}
