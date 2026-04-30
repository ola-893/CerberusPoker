/// Shared types for the CerberusPoker MXE program.
///
/// These types are shared between:
/// - The Arcis encrypted instructions (encrypted-ixs/)
/// - The Solana programs that invoke the MXE (packages/programs/)
/// - The TypeScript SDK (@cerberus-poker/deck)
///
/// Card encoding: card[i] = (i+1) * G  (ElGamal on elliptic curve)
/// Suits: 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades
/// Ranks: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A

use borsh::{BorshDeserialize, BorshSerialize};

/// An ElGamal-encrypted card ciphertext.
/// C1 = r * G  (randomness component)
/// C2 = card*G + r*APK  (message component)
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct EncryptedCard {
    /// C1 = r * G (32-byte compressed point)
    pub c1: [u8; 32],
    /// C2 = card*G + r*APK (32-byte compressed point)
    pub c2: [u8; 32],
}

/// A full encrypted deck — one EncryptedCard per card slot.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct EncryptedDeck {
    /// The encrypted cards in their shuffled order
    pub cards: Vec<EncryptedCard>,
    /// SHA-256 hash of the serialized cards — committed on-chain
    pub commitment_hash: [u8; 32],
    /// The deck size (52 for standard poker)
    pub deck_size: u8,
}

/// An encrypted card dealt specifically to one recipient.
/// The MXE performs threshold decryption so only the recipient
/// with the matching secret key can decrypt this.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct EncryptedCardForRecipient {
    /// The card index in the deck (0-51)
    pub card_index: u8,
    /// Re-encrypted ciphertext — only decryptable by recipient_pubkey
    pub ciphertext: EncryptedCard,
    /// The recipient's public key this was encrypted for
    pub recipient_pubkey: Pubkey,
}

/// A partial decryption token contributed by one player during reveal.
/// reveal_token = sk_i * C1
/// When all players contribute tokens, the card can be decrypted:
///   card*G = C2 - sum(reveal_token_i for all i)
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct RevealToken {
    /// Index of the player contributing this token (0-based)
    pub player_index: u8,
    /// The reveal token: sk_i * C1 (32-byte compressed point)
    pub token: [u8; 32],
}

/// Arcium MXE attestation — proof that a confidential computation
/// was performed correctly by the Cerberus node quorum.
/// Submitted on-chain to verify card reveals.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct MxeAttestation {
    /// The MXE session this attestation belongs to
    pub session_id: [u8; 32],
    /// The card index that was revealed
    pub card_index: u8,
    /// The revealed card value (0-51)
    pub card_value: u8,
    /// Cerberus node quorum signature over (session_id, card_index, card_value)
    pub signature: [u8; 64],
}

/// Result of the atomic showdown operation.
/// All hole cards revealed + winner determined in one MXE operation.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ShowdownResult {
    /// Revealed hands: (player_index, [card0_value, card1_value])
    pub revealed_hands: Vec<(u8, [u8; 2])>,
    /// Index of the winning player
    pub winner_index: u8,
    /// Whether this was a split pot (tie)
    pub is_split: bool,
    /// Indices of all winners (length > 1 if split)
    pub winner_indices: Vec<u8>,
    /// Cerberus quorum attestation over the full showdown result
    pub attestation: [u8; 64],
}

/// A single player's shuffle contribution to the joint shuffle.
/// Each player applies their secret permutation + re-randomization.
/// The MXE combines all contributions under Cerberus MPC.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct PlayerShuffleInput {
    /// The player's index (0-based)
    pub player_index: u8,
    /// The player's public key
    pub pubkey: Pubkey,
    /// Encrypted shuffle contribution (commitment to permutation + randomness)
    /// The actual permutation is kept secret inside the MXE
    pub commitment: [u8; 64],
}

/// Card encoding constants.
/// Cards 0-51: suit = card / 13, rank = card % 13
/// Ranks: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
/// Suits: 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades
pub const DECK_SIZE: u8 = 52;
pub const NUM_SUITS: u8 = 4;
pub const NUM_RANKS: u8 = 13;

/// Returns the rank of a card (0-12, where 0=2 and 12=Ace)
pub fn card_rank(card: u8) -> u8 {
    card % NUM_RANKS
}

/// Returns the suit of a card (0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades)
pub fn card_suit(card: u8) -> u8 {
    card / NUM_RANKS
}
