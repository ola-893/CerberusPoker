/// Confidential reveal instructions for CerberusPoker.
///
/// Two operations:
/// 1. reveal_community_card: reveal a single community card from the encrypted deck
/// 2. atomic_showdown: reveal all hole cards simultaneously at showdown
///
/// Both use threshold decryption via the Cerberus MPC protocol.
/// All MPC nodes contribute partial decryptions to reveal card values.
use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Reveal a community card from the encrypted deck.
    ///
    /// This performs threshold decryption to produce the plaintext card value
    /// visible to all players. The Solana program enforces that all active
    /// players have submitted their reveal contribution before calling this.
    ///
    /// Input:  Enc<Mxe, [u8; 52]> — the shuffled deck
    ///         card_index: u8      — which card to reveal (0-51)
    /// Output: u8                 — card value (plaintext, visible to all)
    #[instruction]
    pub fn reveal_community_card(deck: Enc<Mxe, [u8; 52]>, card_index: u8) -> u8 {
        let cards = deck.to_arcis();

        // Extract the card at the specified index
        let card_value = cards[card_index as usize];

        // Threshold decryption: all MPC nodes contribute to reveal the card
        card_value.reveal()
    }

    /// Reveal a single card from the encrypted deck.
    ///
    /// This is the generic variant used by the Solana poker program. It has
    /// the same circuit shape as reveal_community_card, but uses the
    /// reveal_card computation definition name.
    #[instruction]
    pub fn reveal_card(deck: Enc<Mxe, [u8; 52]>, card_index: u8) -> u8 {
        let cards = deck.to_arcis();
        let card_value = cards[card_index as usize];
        card_value.reveal()
    }

    /// Atomic showdown: reveal all hole cards simultaneously.
    ///
    /// This is the key privacy guarantee — all hands are revealed in one
    /// atomic MXE operation. There is no window where some hands are
    /// revealed but others are not.
    ///
    /// Accepts the encrypted deck and indices of hole cards for each player,
    /// then reveals all hole cards atomically. This prevents selective reveal
    /// attacks where some players see others' hands before revealing their own.
    ///
    /// Input:  deck: Enc<Mxe, [u8; 52]>     — the shuffled encrypted deck
    ///         hole_card_indices: [u8; 12]  — indices for 6 players × 2 cards
    ///         num_players: u8               — number of active players (unused, for clarity)
    /// Output: [u8; 12]                     — all hole card values (plaintext)
    ///
    /// Note: Arcis requires constant loop bounds. We always process all 12 slots.
    /// The caller is responsible for:
    /// - Setting unused indices to valid values (0-51)
    /// - Ignoring unused slots in the output based on num_players
    #[instruction]
    pub fn atomic_showdown(
        deck: Enc<Mxe, [u8; 52]>,
        hole_card_indices: [u8; 12],
        _num_players: u8,
    ) -> [u8; 12] {
        let cards = deck.to_arcis();

        let mut revealed_hands = [0u8; 12];

        // Reveal all 12 hole card slots (6 players × 2 cards max)
        // Arcis requires constant loop bounds, so we always iterate 12 times
        // All cards are revealed atomically in this single MPC computation
        for i in 0..12 {
            let card_index = hole_card_indices[i] as usize;

            // Bounds check: card_index must be 0-51
            // If out of bounds, we use index 0 as a safe fallback
            let safe_index = if card_index < 52 { card_index } else { 0 };

            // Threshold decryption for this card
            revealed_hands[i] = cards[safe_index].reveal();
        }

        revealed_hands
    }
}
