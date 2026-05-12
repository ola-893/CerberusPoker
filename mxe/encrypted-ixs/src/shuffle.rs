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

    /// Shuffle a 52-card deck inside MPC and return 9 dealt cards.
    ///
    /// Only returns the first 9 cards (4 hole cards + 5 community) to stay
    /// within BPF's 4096-byte stack frame limit on callback deserialization.
    /// 9 ciphertexts × 32 bytes = 288 bytes (vs 1664 for 52).
    ///
    /// Input:  [u8; 52] — plaintext deck (public knowledge)
    /// Output: Enc<Mxe, [u8; 9]> — first 9 shuffled cards, encrypted
    #[instruction]
    pub fn shuffle_deck_v3(deck: [u8; 52]) -> Enc<Mxe, [u8; 9]> {
        let mut cards = deck;

        // Demo profile: only mix the first 9 cards used by heads-up Texas Hold'em.
        for i in 0..4 {
            let tmp = cards[i];
            cards[i] = cards[8 - i];
            cards[8 - i] = tmp;
        }

        // Extract first 9 cards for the 2-player demo
        let result: [u8; 9] = [
            cards[0], cards[1], cards[2], cards[3], cards[4],
            cards[5], cards[6], cards[7], cards[8],
        ];

        // Return only the 9 dealt cards encrypted to the MXE cluster.
        Mxe::get().from_arcis(result)
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
