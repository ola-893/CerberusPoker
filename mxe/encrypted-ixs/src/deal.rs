/// Confidential deal instruction for CerberusPoker.
///
/// Deal operation: extract a card from the encrypted deck and return it
/// as plaintext. The MXE performs threshold decryption.
///
/// In Arcium's Cerberus protocol, the deck is stored as Enc<Mxe, [u8; 52]>.
/// To deal a card to a specific player, we:
/// 1. Extract the card at card_index from the encrypted deck
/// 2. Reveal it (threshold decryption by all MPC nodes)
/// 3. Return the plaintext card value
///
/// The recipient receives the card value through the Solana callback.
/// This is simpler than Enc<Shared, u8> because we're not doing
/// client-side decryption - the MXE reveals the card and posts it on-chain
/// where only the designated recipient's DealtCard PDA can read it.
use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Deal one card from the encrypted deck to a recipient.
    ///
    /// The MXE extracts the card at card_index from the encrypted deck
    /// and performs threshold decryption to reveal the card value.
    ///
    /// The revealed card value is returned as plaintext and stored in
    /// the recipient's DealtCard PDA on-chain. Access control is enforced
    /// by the Solana program - only the recipient can read their PDA.
    ///
    /// Input:  deck: Enc<Mxe, [u8; 52]> — the shuffled encrypted deck
    ///         card_index: u8            — which card to deal (0-51)
    /// Output: u8                       — card value (plaintext, 0-51)
    #[instruction]
    pub fn deal_card_to_recipient(deck: Enc<Mxe, [u8; 52]>, card_index: u8) -> u8 {
        let cards = deck.to_arcis();

        // Extract the card at the specified index
        let card_value = cards[card_index as usize];

        // Threshold decryption: all MPC nodes contribute partial decryptions
        // to reveal the card value. The .reveal() operation performs this
        // multi-party computation and returns the plaintext card value.
        card_value.reveal()
    }
}
