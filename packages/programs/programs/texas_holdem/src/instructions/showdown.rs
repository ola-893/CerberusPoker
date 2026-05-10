use crate::errors::TexasHoldemError;
use crate::hand_eval::{evaluate_hand, HandRank, Tiebreaker};
use crate::state::{PokerPhase, PokerTable};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Evaluates all non-folded players' hands and determines the winner(s)
///
/// This instruction requires all non-folded players to have their hands verified
/// via verify_hole_cards before it can proceed. It evaluates each player's best
/// 5-card hand from their 2 hole cards + 5 community cards, determines the winner,
/// and prepares for pot settlement.
///
/// # Requirements
/// 1. Game must be in Showdown phase
/// 2. All non-folded players must have hand_verified_bitmap bit set
/// 3. Community cards must be revealed (5 cards in unmasked_cards)
///
/// # Process
/// 1. Verify all non-folded players have verified hands
/// 2. For each non-folded player:
///    a. Get their 2 hole cards from game_session
///    b. Get the 5 community cards from game_session
///    c. Evaluate their best 5-card hand
/// 3. Compare all hands to determine winner(s)
/// 4. Store winner information for pot settlement
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
///
/// # Errors
/// * `NotInShowdown` - If the game is not in showdown phase
/// * `NotAllHandsVerified` - If any non-folded player hasn't been verified
/// * `NoWinner` - If no active players remain (all folded)
/// * `InvalidGameState` - If game state is inconsistent
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Showdown<'info>>,
    game_id: u64,
) -> Result<()> {
    let table = &ctx.accounts.poker_table;

    // Verify we're in showdown phase
    require!(
        table.phase == PokerPhase::Showdown,
        TexasHoldemError::NotInShowdown
    );

    let game_data = ctx.accounts.game_session.try_borrow_data()?;
    let game_view = GameSessionView::parse(&game_data)?;
    require!(
        table.num_players == game_view.num_players,
        TexasHoldemError::InvalidGameState
    );

    let mut active_count = 0u8;
    let mut sole_active_player = 0u8;
    for player_index in 0..table.num_players {
        if !table.is_folded(player_index) {
            active_count = active_count.saturating_add(1);
            sole_active_player = player_index;
        }
    }
    require!(active_count > 0, TexasHoldemError::NoWinner);

    let mut winners_bitmap = 0u16;
    let mut winner_count = 0u8;

    if active_count == 1 {
        winners_bitmap = 1u16 << sole_active_player;
        winner_count = 1;
        msg!("Player {} wins by default", sole_active_player);
    } else {
        let community_cards = game_view.community_cards()?;
        let mut best_rank = HandRank::HighCard;
        let mut best_tiebreaker = Tiebreaker::new(&[0]);
        let mut best_seen = false;

        for player_index in 0..table.num_players {
            if table.is_folded(player_index) {
                continue;
            }

            let verified_mask = 1u16 << player_index;
            require!(
                (table.hand_verified_bitmap & verified_mask) != 0,
                TexasHoldemError::NotAllHandsVerified
            );

            let hole_cards = game_view.hole_cards(player_index)?;
            let cards = [
                hole_cards[0],
                hole_cards[1],
                community_cards[0],
                community_cards[1],
                community_cards[2],
                community_cards[3],
                community_cards[4],
            ];
            let (rank, tiebreaker) = evaluate_hand(&cards);

            if !best_seen || rank > best_rank || (rank == best_rank && tiebreaker > best_tiebreaker)
            {
                best_seen = true;
                best_rank = rank;
                best_tiebreaker = tiebreaker;
                winners_bitmap = verified_mask;
                winner_count = 1;
            } else if rank == best_rank && tiebreaker == best_tiebreaker {
                winners_bitmap |= verified_mask;
                winner_count = winner_count.saturating_add(1);
            }

            msg!("Player {} hand: {:?} {:?}", player_index, rank, tiebreaker);
        }

        require!(best_seen && winner_count > 0, TexasHoldemError::NoWinner);
        msg!("Winning hand: {:?} {:?}", best_rank, best_tiebreaker);
    }

    settle_escrow(&ctx, game_id, winners_bitmap, winner_count)?;

    let table = &mut ctx.accounts.poker_table;
    table.winners_bitmap = winners_bitmap;
    table.winner_count = winner_count;
    table.pot_total = 0;
    table.phase = PokerPhase::Complete;

    msg!("Showdown complete. Winners bitmap: {}", winners_bitmap);
    Ok(())
}

struct GameSessionView {
    num_players: u8,
    unmasked_cards: [u8; 52],
    card_assigned_to: [u8; 52],
}

impl GameSessionView {
    const NUM_PLAYERS_OFFSET: usize = 8 + 8 + 1 + 1 + 1;
    const UNMASKED_CARDS_OFFSET: usize = 8 + 8 + 1 + 1 + 1 + 1 + 320 + 8 + 32 + 2 + 416;
    const CARD_ASSIGNED_TO_OFFSET: usize = Self::UNMASKED_CARDS_OFFSET + 52;
    const MIN_LEN: usize = Self::CARD_ASSIGNED_TO_OFFSET + 52;

    fn parse(data: &[u8]) -> Result<Self> {
        require!(
            data.len() >= Self::MIN_LEN,
            TexasHoldemError::InvalidGameState
        );

        let mut unmasked_cards = [0xffu8; 52];
        unmasked_cards
            .copy_from_slice(&data[Self::UNMASKED_CARDS_OFFSET..Self::UNMASKED_CARDS_OFFSET + 52]);

        let mut card_assigned_to = [0xfeu8; 52];
        card_assigned_to.copy_from_slice(
            &data[Self::CARD_ASSIGNED_TO_OFFSET..Self::CARD_ASSIGNED_TO_OFFSET + 52],
        );

        Ok(Self {
            num_players: data[Self::NUM_PLAYERS_OFFSET],
            unmasked_cards,
            card_assigned_to,
        })
    }

    fn community_cards(&self) -> Result<[u8; 5]> {
        let mut cards = [0u8; 5];
        let mut count = 0usize;

        for card_index in 0..52 {
            if self.card_assigned_to[card_index] == 0xff {
                let value = self.unmasked_cards[card_index];
                require!(value < 52, TexasHoldemError::InvalidGameState);
                if count < 5 {
                    cards[count] = value;
                }
                count = count.saturating_add(1);
            }
        }

        require!(count >= 5, TexasHoldemError::InvalidGameState);
        Ok(cards)
    }

    fn hole_cards(&self, player_index: u8) -> Result<[u8; 2]> {
        let mut cards = [0u8; 2];
        let mut count = 0usize;

        for card_index in 0..52 {
            if self.card_assigned_to[card_index] == player_index {
                let value = self.unmasked_cards[card_index];
                require!(value < 52, TexasHoldemError::InvalidGameState);
                if count < 2 {
                    cards[count] = value;
                }
                count = count.saturating_add(1);
            }
        }

        require!(count >= 2, TexasHoldemError::NoCardsToVerify);
        Ok(cards)
    }
}

fn settle_escrow<'info>(
    ctx: &Context<'_, '_, '_, 'info, Showdown<'info>>,
    game_id: u64,
    winners_bitmap: u16,
    winner_count: u8,
) -> Result<()> {
    let escrow_amount = ctx.accounts.escrow_account.amount;
    if escrow_amount == 0 {
        return Ok(());
    }

    require!(winner_count > 0, TexasHoldemError::NoWinner);
    require!(
        escrow_amount % winner_count as u64 == 0,
        TexasHoldemError::SettlementFailed
    );

    let share = escrow_amount / winner_count as u64;
    let game_id_bytes = game_id.to_le_bytes();
    let bump = ctx.accounts.poker_table.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"table", game_id_bytes.as_ref(), &[bump]]];

    for player_index in 0..ctx.accounts.poker_table.num_players {
        if (winners_bitmap & (1u16 << player_index)) == 0 {
            continue;
        }

        let destination = ctx.accounts.poker_table.player_stacks[player_index as usize];
        require!(
            destination != Pubkey::default(),
            TexasHoldemError::InvalidStackAccount
        );

        let winner_account = ctx
            .remaining_accounts
            .iter()
            .find(|account| account.key() == destination)
            .ok_or(TexasHoldemError::InvalidStackAccount)?;

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: winner_account.clone(),
            authority: ctx.accounts.poker_table.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, share)?;
        msg!("Paid {} to player {}", share, player_index);
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct Showdown<'info> {
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,

    /// The GameSession PDA from cerberus_poker program.
    /// CHECK: We read card_assigned_to and unmasked_cards from this account
    #[account(
        constraint = game_session.key() == poker_table.game_session @ TexasHoldemError::InvalidGameState
    )]
    pub game_session: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidPotAccount
    )]
    pub escrow_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub caller: Signer<'info>,
}
