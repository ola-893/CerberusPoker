use anchor_lang::prelude::*;

/// Game session state — one PDA per game, seeded by [b"game", game_id.to_le_bytes()]
///
/// Tracks the full lifecycle of a private card game:
/// Lobby → Shuffle → Deal → Active → Showdown → Complete
#[account]
pub struct GameSession {
    /// Unique game identifier
    pub game_id: u64,
    /// Current state machine phase
    pub state: GameState,
    /// Maximum number of players allowed by the demo profile
    pub max_players: u8,
    /// Deck size (52 for standard poker)
    pub deck_size: u8,
    /// Number of players currently registered
    pub num_players: u8,
    /// Player wallet addresses (up to 10)
    pub players: [Pubkey; 10],
    /// Arcium MXE computation offset for the active shuffle computation
    /// Used to track which computation to await the callback for
    pub active_computation_offset: u64,
    /// SHA-256 hash of the encrypted deck after shuffle completes
    /// Committed on-chain to prevent deck substitution
    pub encrypted_deck_hash: [u8; 32],
    /// Bitmask: which players have completed their shuffle contribution
    /// bit i = 1 means player i has shuffled
    pub shuffle_bitmap: u16,
    /// Per-card reveal contribution tracking.
    /// reveal_bitmap[card_index] bit player_index = 1 means that player submitted
    /// their reveal contribution for that card.
    pub reveal_bitmap: [u64; 52],
    /// Revealed card values: unmasked_cards[i] = card value at deck position i
    /// 0xFF = not yet revealed
    pub unmasked_cards: [u8; 52],
    /// Card assignment: card_assigned_to[i] = player index (0-based)
    /// 0xFF = community card, 0xFE = unassigned
    pub card_assigned_to: [u8; 52],
    /// Bitmask: which card values have been used (prevents duplicates)
    /// bit i = 1 means card value i has appeared in this game
    pub card_value_used: [u64; 1],
    /// Unix timestamp when game was created
    pub created_at: i64,
    /// Unix timestamp deadline for shuffle phase (0 = no deadline set)
    pub shuffle_deadline: i64,
    /// Unix timestamp deadline for reveal phase (0 = no deadline set)
    pub reveal_deadline: i64,
    /// Card index associated with the active reveal computation
    pub pending_reveal_card_index: u8,
    /// Card index associated with the active deal computation
    pub pending_deal_card_index: u8,
    /// Player index associated with the active deal computation
    pub pending_deal_player_index: u8,
    /// PDA bump seed
    pub bump: u8,
}

impl GameSession {
    /// Account space: discriminator + all fields
    pub const SPACE: usize = 8   // discriminator
        + 8   // game_id
        + 1   // state
        + 1   // max_players
        + 1   // deck_size
        + 1   // num_players
        + 320 // players: 10 * 32
        + 8   // active_computation_offset
        + 32  // encrypted_deck_hash
        + 2   // shuffle_bitmap
        + 416 // reveal_bitmap: 52 * 8
        + 52  // unmasked_cards
        + 52  // card_assigned_to
        + 8   // card_value_used
        + 8   // created_at
        + 8   // shuffle_deadline
        + 8   // reveal_deadline
        + 1   // pending_reveal_card_index
        + 1   // pending_deal_card_index
        + 1   // pending_deal_player_index
        + 1; // bump

    /// Check if a card value has already been used in this game
    pub fn is_card_value_used(&self, value: u8) -> bool {
        if value >= 52 {
            return true;
        }
        (self.card_value_used[0] >> value) & 1 == 1
    }

    /// Mark a card value as used
    pub fn mark_card_value_used(&mut self, value: u8) {
        if value < 52 {
            self.card_value_used[0] |= 1u64 << value;
        }
    }

    /// Check if a card has been revealed
    pub fn is_card_revealed(&self, card_index: u8) -> bool {
        if card_index >= 52 {
            return false;
        }
        self.unmasked_cards[card_index as usize] != UNREVEALED
    }

    /// Mark a card as revealed
    pub fn mark_card_revealed(&mut self, _card_index: u8) {
        // Revealed status is derived from unmasked_cards so there is no
        // separate card-level bitmap to mutate.
    }

    /// Check whether a player has submitted their reveal contribution for a card
    pub fn has_player_submitted_reveal(&self, card_index: u8, player_index: u8) -> bool {
        if card_index >= 52 || player_index >= 64 {
            return false;
        }
        (self.reveal_bitmap[card_index as usize] & (1u64 << player_index)) != 0
    }

    /// Mark a player's reveal contribution for a card
    pub fn mark_player_reveal_submitted(&mut self, card_index: u8, player_index: u8) {
        if card_index < 52 && player_index < 64 {
            self.reveal_bitmap[card_index as usize] |= 1u64 << player_index;
        }
    }

    /// Check whether every registered player has submitted a reveal contribution
    pub fn all_players_submitted_reveal(&self, card_index: u8) -> bool {
        if card_index >= 52 || self.num_players == 0 {
            return false;
        }

        let mask = (1u64 << self.num_players) - 1;
        self.reveal_bitmap[card_index as usize] & mask == mask
    }

    /// Check if a player has shuffled
    pub fn has_player_shuffled(&self, player_index: u8) -> bool {
        if player_index >= 10 {
            return false;
        }
        (self.shuffle_bitmap >> player_index) & 1 == 1
    }

    /// Mark a player as having shuffled
    pub fn mark_player_shuffled(&mut self, player_index: u8) {
        if player_index < 10 {
            self.shuffle_bitmap |= 1u16 << player_index;
        }
    }

    /// Check if all players have shuffled
    pub fn all_players_shuffled(&self) -> bool {
        let mask = (1u16 << self.num_players) - 1;
        self.shuffle_bitmap & mask == mask
    }
}

/// Game state machine
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default, Debug)]
pub enum GameState {
    /// Waiting for players to join
    #[default]
    Lobby,
    /// Players are submitting shuffle contributions to the MXE
    Shuffle,
    /// Deck is shuffled; cards being dealt via MXE threshold decryption
    Deal,
    /// Cards dealt; betting rounds in progress
    Active,
    /// Final betting round complete; revealing hole cards
    Showdown,
    /// Game finished; pot settled
    Complete,
}

/// Events emitted by the program for client-side tracking

#[event]
pub struct GameCreated {
    pub game_id: u64,
    pub creator: Pubkey,
    pub max_players: u8,
    pub deck_size: u8,
}

#[event]
pub struct PlayerJoined {
    pub game_id: u64,
    pub player: Pubkey,
    pub player_index: u8,
}

#[event]
pub struct ShuffleStarted {
    pub game_id: u64,
    pub computation_offset: u64,
}

#[event]
pub struct ShuffleComplete {
    pub game_id: u64,
    pub deck_hash: [u8; 32],
}

#[event]
pub struct CardDealt {
    pub game_id: u64,
    pub card_index: u8,
    pub player_index: u8,
}

#[event]
pub struct CardRevealed {
    pub game_id: u64,
    pub card_index: u8,
    pub card_value: u8,
}

#[event]
pub struct ShowdownComplete {
    pub game_id: u64,
    pub revealed_hands: [u8; 12], // demo uses first 2 players x 2 cards
    pub num_players: u8,
}

/// Constants
pub const SHUFFLE_TIMEOUT_SECS: i64 = 300; // 5 minutes
pub const REVEAL_TIMEOUT_SECS: i64 = 300; // 5 minutes
pub const MAX_PLAYERS: u8 = 2;
pub const DECK_SIZE: u8 = 52;
pub const UNASSIGNED: u8 = 0xFE;
pub const COMMUNITY_CARD: u8 = 0xFF;
pub const UNREVEALED: u8 = 0xFF;
