use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct PokerTable {
    pub game_session: Pubkey,           // reference to GameSession PDA
    pub phase: PokerPhase,
    pub dealer_index: u8,
    pub current_player: u8,
    pub pot_mint: Pubkey,               // C-SPL token mint for this table
    pub pot_account: Pubkey,            // encrypted pot balance
    pub escrow_account: Pubkey,         // USDC+ escrow PDA (Phase 1: standard SPL token account)
    pub player_stacks: [Pubkey; 10],    // C-SPL token accounts (encrypted)
    pub player_bets: [Pubkey; 10],      // current round bet accounts
    pub current_bet: u64,               // plaintext minimum (for UI display)
    pub folded_bitmap: u16,
    pub all_in_bitmap: u16,
    pub hand_verified_bitmap: u16,      // hole cards verified at showdown
    pub small_blind: u64,
    pub big_blind: u64,
    pub hand_number: u32,
    pub bump: u8,
}

impl PokerTable {
    // 8 (discriminator) + 32 (game_session) + 1 (phase) + 1 (dealer_index) + 1 (current_player)
    // + 32 (pot_mint) + 32 (pot_account) + 32 (escrow_account) + 320 (player_stacks: 10*32) + 320 (player_bets: 10*32)
    // + 8 (current_bet) + 2 (folded_bitmap) + 2 (all_in_bitmap) + 2 (hand_verified_bitmap)
    // + 8 (small_blind) + 8 (big_blind) + 4 (hand_number) + 1 (bump)
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 1 + 32 + 32 + 32 + 320 + 320 + 8 + 2 + 2 + 2 + 8 + 8 + 4 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum PokerPhase {
    #[default]
    PreFlop,
    Flop,
    Turn,
    River,
    Showdown,
}

pub const BETTING_TIMEOUT_SECS: i64 = 120;
