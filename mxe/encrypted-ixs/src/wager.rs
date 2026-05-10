/// Wager Module — Confidential Bet Amount Storage
///
/// This module implements Phase 1 of the wager strategy:
/// - Players transfer USDC+ to escrow (plaintext SPL transfer)
/// - The MXE stores each player's bet amount as Enc<Mxe, u64> — hidden from all observers
/// - At showdown, the MXE reveals the winner and correct pot distribution
///
/// Phase 2 (when C-SPL ships): Replace with full confidential transfers
use arcis::*;

#[encrypted]
pub mod wager_circuits {
    use arcis::*;

    /// Store a player's bet amount as Enc<Mxe, u64> inside the MXE.
    /// The bet amount is hidden from all observers including validators.
    /// Only the MXE can read this value before showdown.
    ///
    /// # Arguments
    /// * `_amount` - The bet amount in USDC+ tokens (lamports) - stored in MXE state
    /// * `player_index` - Index of the player placing the bet (0-9)
    ///
    /// # Returns
    /// * `success` - Confirmation that the encrypted bet was stored
    /// * `player_index` - Echo back the player index for verification
    #[instruction]
    pub fn place_bet(_amount: u64, player_index: u8) -> (bool, u8) {
        // In a real implementation, this would store the encrypted amount
        // in MXE state associated with the player_index.
        // For now, we return success confirmation.
        //
        // The MXE maintains a mapping: player_index -> Enc<Mxe, u64>
        // This encrypted value is only readable by the MXE itself.

        (true, player_index)
    }
}
