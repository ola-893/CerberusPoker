use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct PokerTable {
    pub game_session: Pubkey, // reference to GameSession PDA
    pub phase: PokerPhase,
    pub dealer_index: u8,
    pub current_player: u8,
    pub pot_mint: Pubkey,            // C-SPL token mint for this table
    pub pot_account: Pubkey,         // encrypted pot balance
    pub escrow_account: Pubkey,      // USDC+ escrow PDA (Phase 1: standard SPL token account)
    pub player_stacks: [Pubkey; 10], // C-SPL token accounts (encrypted)
    pub player_bets: [Pubkey; 10],   // current round bet accounts
    pub current_bet: u64,            // plaintext minimum (for UI display)
    pub folded_bitmap: u16,
    pub all_in_bitmap: u16,
    pub hand_verified_bitmap: u16, // hole cards verified at showdown
    pub small_blind: u64,
    pub big_blind: u64,
    pub hand_number: u32,
    pub last_action_time: i64, // timestamp of last player action (for timeout enforcement)
    pub num_players: u8,       // players seated in the current hand
    pub acted_bitmap: u16,     // players who have acted in this betting round
    pub winners_bitmap: u16,   // last committed showdown winners
    pub winner_count: u8,      // number of winners in the bitmap
    pub last_raise: u64,       // standard Hold'em minimum raise basis
    pub pot_total: u64,        // plaintext escrow total for Phase 1 UI/accounting
    pub player_round_bets: [u64; 10], // current betting-round contribution by player
    pub bump: u8,
}

impl PokerTable {
    // 8 (discriminator) + 32 (game_session) + 1 (phase) + 1 (dealer_index) + 1 (current_player)
    // + 32 (pot_mint) + 32 (pot_account) + 32 (escrow_account) + 320 (player_stacks: 10*32) + 320 (player_bets: 10*32)
    // + 8 (current_bet) + 2 (folded_bitmap) + 2 (all_in_bitmap) + 2 (hand_verified_bitmap)
    // + 8 (small_blind) + 8 (big_blind) + 4 (hand_number) + 8 (last_action_time)
    // + 1 (num_players) + 2 (acted_bitmap) + 2 (winners_bitmap) + 1 (winner_count)
    // + 8 (last_raise) + 8 (pot_total) + 80 (player_round_bets: 10*8) + 1 (bump)
    pub const SPACE: usize = 8
        + 32
        + 1
        + 1
        + 1
        + 32
        + 32
        + 32
        + 320
        + 320
        + 8
        + 2
        + 2
        + 2
        + 8
        + 8
        + 4
        + 8
        + 1
        + 2
        + 2
        + 1
        + 8
        + 8
        + 80
        + 1;

    pub fn active_players(&self) -> u8 {
        let mut count = 0u8;
        for player_index in 0..self.num_players {
            if !self.is_folded(player_index) {
                count = count.saturating_add(1);
            }
        }
        count
    }

    pub fn is_folded(&self, player_index: u8) -> bool {
        (self.folded_bitmap & (1u16 << player_index)) != 0
    }

    pub fn is_all_in(&self, player_index: u8) -> bool {
        (self.all_in_bitmap & (1u16 << player_index)) != 0
    }

    pub fn has_acted(&self, player_index: u8) -> bool {
        (self.acted_bitmap & (1u16 << player_index)) != 0
    }

    pub fn mark_acted(&mut self, player_index: u8) {
        self.acted_bitmap |= 1u16 << player_index;
    }

    pub fn reset_betting_round(&mut self, first_player: u8) {
        self.current_bet = 0;
        self.last_raise = self.big_blind;
        self.acted_bitmap = 0;
        self.player_round_bets = [0u64; 10];
        self.current_player = first_player;
    }

    pub fn next_action_player(&self, from_player: u8) -> Option<u8> {
        if self.num_players == 0 {
            return None;
        }

        let mut next_player = (from_player + 1) % self.num_players;
        let mut attempts = 0u8;
        while attempts < self.num_players {
            if !self.is_folded(next_player) && !self.is_all_in(next_player) {
                return Some(next_player);
            }
            next_player = (next_player + 1) % self.num_players;
            attempts = attempts.saturating_add(1);
        }

        None
    }

    pub fn betting_round_complete(&self) -> bool {
        if self.active_players() <= 1 {
            return true;
        }

        for player_index in 0..self.num_players {
            if self.is_folded(player_index) || self.is_all_in(player_index) {
                continue;
            }

            if !self.has_acted(player_index) {
                return false;
            }

            if self.player_round_bets[player_index as usize] < self.current_bet {
                return false;
            }
        }

        true
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default, Debug)]
pub enum PokerPhase {
    #[default]
    PreFlop,
    Flop,
    Turn,
    River,
    Showdown,
    Complete,
}

pub const BETTING_TIMEOUT_SECS: i64 = 120;
