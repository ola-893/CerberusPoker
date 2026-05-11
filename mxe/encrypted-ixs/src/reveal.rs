/// Confidential reveal instructions for CerberusPoker.
///
/// Two operations:
/// 1. reveal_card: multi-party reveal of a single community card
/// 2. atomic_showdown: reveal all hole cards simultaneously at showdown

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// An encrypted card ciphertext
    pub struct EncryptedCard {
        c1: [u8; 32],
        c2: [u8; 32],
    }

    /// Reveal a single community card.
    ///
    /// All active players must have submitted their reveal tokens before
    /// this instruction is called. The MXE aggregates the tokens and
    /// computes the plaintext card value.
    ///
    /// card_value = lookup(C2 - sum(sk_i * C1) for all i)
    ///
    /// Returns: u8 — the revealed card value (plaintext, 0-51)
    #[instruction]
    pub fn reveal_card(
        card: Enc<Mxe, EncryptedCard>,
        _card_index: u8,
    ) -> u8 {
        let c = card.to_arcis();

        // In the MXE under Cerberus MPC:
        // 1. Each node contributes its partial decryption: sk_i * C1
        // 2. Nodes jointly compute: card_point = C2 - sum(sk_i * C1)
        // 3. Lookup card_point in precomputed table to get card_value (0-51)

        // Placeholder: derive card value from ciphertext hash
        // Real implementation uses EC discrete log lookup table
        let card_value = c.c1[0] % 52;

        card_value.reveal()
    }

    /// Reveal a community card from the encrypted deck.
    ///
    /// This is the simplified version that accepts the full encrypted deck
    /// and a card index, then reveals that specific card publicly.
    ///
    /// All active players must contribute reveal tokens before this instruction
    /// is called. The MXE performs threshold decryption to produce the plaintext
    /// card value visible to all players.
    ///
    /// Input:  Enc<Mxe, [u8; 52]> — the shuffled deck
    ///         card_index: u8      — which card to reveal (0-51)
    /// Output: u8                 — card value (plaintext, visible to all)
    #[instruction]
    pub fn reveal_community_card(
        deck: Enc<Mxe, [u8; 52]>,
        card_index: u8,
    ) -> u8 {
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
    ///         hole_card_indices: [u8; 12]  - demo uses the first 4 indices
    ///         num_players: u8               — number of active players
    /// Output: [u8; 12]                     — all hole card values (plaintext)
    ///
    /// Returns: [u8; 12] - demo fills the first 4 slots for 2 players
    #[instruction]
    pub fn atomic_showdown_demo(
        deck: Enc<Mxe, [u8; 52]>,
        hole_card_indices: [u8; 12],
        _num_players: u8,
    ) -> [u8; 12] {
        let cards = deck.to_arcis();

        // In the MXE under Cerberus MPC:
        // 1. Threshold-decrypt all hole cards simultaneously using the indices
        // 2. Return all revealed cards atomically
        //
        // This atomic reveal is critical: no player can see others' hands
        // before their own is revealed. All hands are exposed in one operation.
        //
        // Demo profile: process the first two players only. Keeping the output
        // as [u8; 12] avoids touching callback and IDL plumbing.

        let mut revealed_hands = [0u8; 12];
        
        // Demo profile reveals 4 hole card slots (2 players * 2 cards).
        for i in 0..4 {
            let card_index = hole_card_indices[i] as usize;
            revealed_hands[i] = cards[card_index].reveal();
        }

        revealed_hands
    }
}
