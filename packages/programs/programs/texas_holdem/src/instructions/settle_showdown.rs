use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_macros::comp_def_offset;
use crate::errors::TexasHoldemError;
use crate::state::PokerTable;
use crate::hand_eval::{evaluate_hand, HandRank};

const COMP_DEF_OFFSET_ATOMIC_SHOWDOWN: u32 = comp_def_offset("atomic_showdown_demo");

/// Output from atomic_showdown MXE instruction.
/// All hole cards are revealed atomically at showdown.
#[derive(AnchorDeserialize)]
pub struct AtomicShowdownOutput {
    /// All hole cards revealed (demo uses first 2 players x 2 cards = 12 cards)
    /// Format: [player0_card0, player0_card1, player1_card0, player1_card1, ...]
    pub revealed_hands: [u8; 12],
    /// Number of active players (not folded)
    pub num_players: u8,
}

/// Settle showdown: transfer pot to winner based on MXE-attested showdown result.
///
/// This instruction is triggered by the `atomic_showdown` callback from the MXE.
/// It performs the following:
/// 1. Verifies the MXE output signature (ensures authenticity)
/// 2. Evaluates all revealed hands using the on-chain hand evaluator
/// 3. Determines the winner (or winners in case of a tie)
/// 4. Transfers the full pot from escrow PDA to winner(s)
///
/// # Settlement Rules
/// - Single winner: receives full pot
/// - Tie: pot split equally between tied winners
/// - Folded players: excluded from evaluation
///
/// # Arguments
/// * `game_id` - Unique identifier for the game (used as PDA seed)
/// * `community_cards` - The 5 community cards (flop, turn, river)
///
/// # Errors
/// * `AbortedComputation` - If MXE output verification fails
/// * `InvalidGameState` - If game state is invalid
/// * `NoWinner` - If no winner can be determined
/// * `SettlementFailed` - If pot transfer fails
pub fn handler(
    ctx: Context<SettleShowdown>,
    _game_id: u64,
    output: SignedComputationOutputs<AtomicShowdownOutput>,
    community_cards: [u8; 5],
) -> Result<()> {
    let table = &ctx.accounts.poker_table;

    // Verify the MXE output signature — ensures result is authentic
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(out) => out,
        Err(e) => {
            msg!("Atomic showdown MXE output verification failed: {}", e);
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    // Validate number of players is within bounds
    require!(
        result.num_players > 0 && result.num_players <= 2,
        TexasHoldemError::InvalidGameState
    );

    msg!("Atomic showdown revealed {} players' hands", result.num_players);

    // Evaluate all hands and determine winner(s)
    let mut best_rank = HandRank::HighCard;
    let mut best_kicker = 0u8;
    let mut winners: Vec<u8> = Vec::new();

    for player_idx in 0..result.num_players {
        // Check if player folded
        let folded = (table.folded_bitmap & (1 << player_idx)) != 0;
        if folded {
            msg!("Player {} folded — excluded from showdown", player_idx);
            continue;
        }

        // Extract hole cards for this player
        let hole_card_0 = result.revealed_hands[(player_idx * 2) as usize];
        let hole_card_1 = result.revealed_hands[(player_idx * 2 + 1) as usize];

        // Validate card values are in range (0-51)
        require!(
            hole_card_0 < 52 && hole_card_1 < 52,
            TexasHoldemError::InvalidGameState
        );

        // Build 7-card hand (2 hole + 5 community)
        let hand = [
            hole_card_0,
            hole_card_1,
            community_cards[0],
            community_cards[1],
            community_cards[2],
            community_cards[3],
            community_cards[4],
        ];

        // Evaluate hand
        let (rank, kicker) = evaluate_hand(&hand);

        msg!(
            "Player {} hand: {:?} (kicker: {})",
            player_idx,
            rank,
            kicker
        );

        // Compare with current best
        if rank > best_rank || (rank == best_rank && kicker > best_kicker) {
            // New winner
            best_rank = rank;
            best_kicker = kicker;
            winners.clear();
            winners.push(player_idx);
        } else if rank == best_rank && kicker == best_kicker {
            // Tie — add to winners list
            winners.push(player_idx);
        }
    }

    // Ensure we have at least one winner
    require!(!winners.is_empty(), TexasHoldemError::NoWinner);

    msg!(
        "Winner(s): {:?} with {:?} (kicker: {})",
        winners,
        best_rank,
        best_kicker
    );

    // Get pot balance from escrow account
    let pot_balance = ctx.accounts.escrow_account.amount;
    require!(pot_balance > 0, TexasHoldemError::InvalidPotAccount);

    // Calculate payout per winner (split pot if tie)
    let num_winners = winners.len() as u64;
    let payout_per_winner = pot_balance
        .checked_div(num_winners)
        .ok_or(TexasHoldemError::Overflow)?;

    msg!(
        "Pot balance: {} USDC+, payout per winner: {}",
        pot_balance,
        payout_per_winner
    );

    // Transfer pot to winner(s)
    // We need to use the table PDA as the authority for the escrow account
    let game_id_bytes = _game_id.to_le_bytes();
    let seeds = &[
        b"table".as_ref(),
        game_id_bytes.as_ref(),
        &[table.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    for (idx, &winner_idx) in winners.iter().enumerate() {
        // Get winner's token account from remaining_accounts
        let winner_token_account = &ctx.remaining_accounts[winner_idx as usize];

        // Verify it's a valid token account
        let winner_account_info = winner_token_account.to_account_info();
        let winner_token_data = TokenAccount::try_deserialize(
            &mut &winner_account_info.data.borrow()[..]
        ).map_err(|_| TexasHoldemError::InvalidStackAccount)?;

        // Verify the token account has the correct mint
        require!(
            winner_token_data.mint == table.pot_mint,
            TexasHoldemError::InvalidStackAccount
        );

        // Transfer payout to winner
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: winner_account_info.clone(),
            authority: ctx.accounts.poker_table.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        token::transfer(cpi_ctx, payout_per_winner)?;

        msg!(
            "Transferred {} USDC+ to winner {} (player {})",
            payout_per_winner,
            idx,
            winner_idx
        );
    }

    msg!("Showdown settlement complete");
    Ok(())
}

#[callback_accounts("atomic_showdown_demo")]
#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct SettleShowdown<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ATOMIC_SHOWDOWN))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, TexasHoldemError::InvalidGameState)
    )]
    pub cluster_account: Account<'info, Cluster>,

    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,

    /// The PokerTable PDA for this game
    #[account(
        mut,
        seeds = [b"table", game_id.to_le_bytes().as_ref()],
        bump = poker_table.bump,
    )]
    pub poker_table: Account<'info, PokerTable>,

    /// Escrow PDA token account (source of pot funds)
    /// This is a standard SPL token account that holds USDC+ during the game
    #[account(
        mut,
        constraint = escrow_account.key() == poker_table.escrow_account @ TexasHoldemError::InvalidGameState
    )]
    pub escrow_account: Account<'info, TokenAccount>,

    /// SPL Token program for USDC+ transfer
    pub token_program: Program<'info, Token>,

    // Note: Winner token accounts are passed via remaining_accounts
    // This allows for flexible number of winners (1-6) without fixed account structure
}
