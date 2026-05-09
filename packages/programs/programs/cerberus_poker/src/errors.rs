use anchor_lang::prelude::*;

#[error_code]
pub enum CerberusPokerError {
    // ─── Game State Errors ────────────────────────────────────────────────────

    /// Action requires a different game state than the current one
    #[msg("Invalid game state for this action")]
    InvalidGameState,

    /// Game is already full — max_players reached
    #[msg("Game is full")]
    GameFull,

    /// Game has not started yet — not enough players
    #[msg("Not enough players to start")]
    NotEnoughPlayers,

    /// Player is not registered in this game
    #[msg("Player not found in this game")]
    PlayerNotFound,

    /// Player is already registered in this game
    #[msg("Player already joined this game")]
    PlayerAlreadyJoined,

    // ─── Turn / Action Errors ─────────────────────────────────────────────────

    /// It is not this player's turn to act
    #[msg("Not your turn")]
    NotYourTurn,

    /// Player has already shuffled in this round
    #[msg("Player has already shuffled")]
    AlreadyShuffled,

    /// Card has already been revealed
    #[msg("Card already revealed")]
    CardAlreadyRevealed,

    /// Player already submitted their reveal contribution for this card
    #[msg("Reveal contribution already submitted for this player and card")]
    RevealAlreadySubmitted,

    // ─── Card / Deck Errors ───────────────────────────────────────────────────

    /// A card value appeared more than once in the game — deck integrity violation
    #[msg("Duplicate card value detected")]
    DuplicateCardValue,

    /// Card value is out of range (must be 0-51)
    #[msg("Card value out of range (must be 0-51)")]
    CardValueOutOfRange,

    /// Card index is out of range for this deck size
    #[msg("Card index out of range")]
    CardIndexOutOfRange,

    /// Card has not been assigned to any player yet
    #[msg("Card not yet assigned")]
    CardNotAssigned,

    /// Deck integrity check failed — shuffle produced invalid deck
    #[msg("Deck integrity check failed")]
    DeckIntegrityFailed,

    // ─── Timeout Errors ───────────────────────────────────────────────────────

    /// Timeout cannot be triggered — deadline has not passed yet
    #[msg("Timeout deadline has not been reached yet")]
    TimeoutNotReached,

    /// No deadline is set for the current phase
    #[msg("No deadline set for current phase")]
    NoDeadlineSet,

    // ─── MXE / Computation Errors ─────────────────────────────────────────────

    /// The Arcium MXE computation was aborted or returned an error
    #[msg("MXE computation was aborted")]
    AbortedComputation,

    /// MXE output verification failed — result may be tampered
    #[msg("MXE output verification failed")]
    InvalidMxeOutput,

    /// Computation offset mismatch — callback does not match queued computation
    #[msg("Computation offset mismatch")]
    ComputationOffsetMismatch,

    // ─── Authorization Errors ─────────────────────────────────────────────────

    /// Only the game creator can perform this action
    #[msg("Only the game creator can perform this action")]
    UnauthorizedCreator,

    /// Signer is not a participant in this game
    #[msg("Signer is not a participant in this game")]
    UnauthorizedPlayer,

    // ─── Arithmetic / Overflow ────────────────────────────────────────────────

    /// Arithmetic overflow
    #[msg("Arithmetic overflow")]
    Overflow,
}
