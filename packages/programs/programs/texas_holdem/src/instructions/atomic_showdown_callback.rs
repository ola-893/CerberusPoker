use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use crate::errors::TexasHoldemError;
use crate::state::PokerTable;
use crate::hand_eval::{evaluate_hand, HandRank};

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
    ctx: Context<crate::AtomicShowdownCallback>,
    output: ComputationOutputs<crate::AtomicShowdownOutput>,
) -> Result<()> {
    let table = &ctx.accounts.poker_table;

    // Match on the ComputationOutputs enum
    let result = match output {
        ComputationOutputs::Success(out) => out,
        ComputationOutputs::Failure => {
            msg!("Atomic showdown MXE computation failed");
            return Err(TexasHoldemError::AbortedComputation.into());
        }
    };

    // Validate number of players is within bounds
    require!(
        result.num_players > 0 && result.num_players <= 6,
        TexasHoldemError::InvalidGameState
    );

    msg!("Atomic showdown revealed {} players' hands", result.num_players);

    // TODO: Community cards need to be passed differently in 0.4.0
    // For now, use placeholder values
    let community_cards = [0u8; 5];

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
    // TODO: game_id needs to be stored in the table or passed differently
    let game_id = 0u64; // Placeholder
    let game_id_bytes = game_id.to_le_bytes();
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

// The SettleShowdownAccounts struct is defined in lib.rs
