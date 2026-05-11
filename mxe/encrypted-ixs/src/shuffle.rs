/// CerberusPoker — Confidential Shuffle & Deal Instructions
///
/// These instructions run inside the Arcium MXE under the Cerberus protocol
/// (dishonest majority MPC — secure even if all nodes except one are malicious).
///
/// Key facts from Arcium docs:
/// - Demo profile: compact first-9-card mix for devnet uploads
/// - Enc<Mxe, T> — only the MXE cluster can decrypt (deck state)
/// - Enc<Shared, T> — client + MXE share a secret (dealt cards — only recipient decrypts)
/// - No Vec/HashMap/String — fixed-size arrays only
/// - Output limit: ~1232 bytes per callback transaction
use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ─── Shuffle ──────────────────────────────────────────────────────────────

    /// Shuffle a 52-card deck inside MPC.
    ///
    /// The deck is represented as [u8; 52] where deck[i] = card value (0-51).
    /// The demo profile uses a compact deterministic mix for the first 9 cards
    /// so the raw circuit account stays small enough for devnet.
    ///
    /// Input:  Enc<Mxe, [u8; 52]> — encrypted deck, only MXE can read
    /// Output: Enc<Mxe, [u8; 52]> — shuffled deck, still encrypted
    #[instruction]
    pub fn shuffle_deck_demo(deck: Enc<Mxe, [u8; 52]>) -> Enc<Mxe, [u8; 52]> {
        let mut cards = deck.to_arcis();

        // Demo profile: only mix the first 9 cards used by heads-up Texas Hold'em.
        for i in 0..4 {
            let tmp = cards[i];
            cards[i] = cards[8 - i];
            cards[8 - i] = tmp;
        }

        deck.owner.from_arcis(cards)
    }

    // ─── Deal ─────────────────────────────────────────────────────────────────

    /// Deal one card to a specific recipient.
    ///
    /// Reads the card at card_index from the encrypted deck and returns it
    /// as plaintext. The MXE performs threshold decryption.
    ///
    /// Input:  Enc<Mxe, [u8; 52]> — the shuffled deck
    ///         card_index: u8      — which card slot to deal (0-51)
    /// Output: u8                 — card value (plaintext)
    #[instruction]
    pub fn deal_card(deck: Enc<Mxe, [u8; 52]>, card_index: u8) -> u8 {
        let cards = deck.to_arcis();
        let card_value = cards[card_index as usize];
        card_value.reveal()
    }

    // ─── Verify deck integrity ────────────────────────────────────────────────

    /// Verify that the deck contains exactly 52 unique card values (0-51).
    ///
    /// Called after shuffle to prove deck integrity on-chain.
    /// Returns true if valid, false if any duplicates or out-of-range values.
    /// Result is revealed (plaintext) — it's a boolean proof, not sensitive data.
    #[instruction]
    pub fn verify_deck_integrity(deck: Enc<Mxe, [u8; 52]>) -> bool {
        let cards = deck.to_arcis();
        let mut seen = [false; 52];
        let mut valid = true;

        for i in 0..52 {
            let v = cards[i] as usize;
            if v >= 52 {
                valid = false;
            } else if seen[v] {
                valid = false;
            } else {
                seen[v] = true;
            }
        }

        valid.reveal()
    }
}
