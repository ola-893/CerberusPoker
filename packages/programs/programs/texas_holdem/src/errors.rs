use anchor_lang::prelude::*;

#[error_code]
pub enum TexasHoldemError {
    // ─── Turn / Action Errors ─────────────────────────────────────────────────

    /// It is not this player's turn to act
    #[msg("Not your turn to act")]
    NotYourTurn,

    /// Invalid action for the current poker phase
    #[msg("Invalid action for current phase")]
    InvalidAction,

    /// Player has already acted in this betting round
    #[msg("Player has already acted this round")]
    AlreadyActed,

    /// Player has already folded and cannot act
    #[msg("Player has folded and cannot act")]
    PlayerFolded,

    /// Player is all-in and cannot act
    #[msg("Player is all-in and cannot act")]
    PlayerAllIn,

    // ─── Betting Errors ───────────────────────────────────────────────────────

    /// Insufficient balance to complete the action
    #[msg("Insufficient balance")]
    InsufficientBalance,

    /// Raise amount is below the minimum raise
    #[msg("Raise amount below minimum")]
    RaiseTooSmall,

    /// Bet amount does not match the current bet (for Call action)
    #[msg("Call amount does not match current bet")]
    InvalidCallAmount,

    /// Cannot check when there is a bet to call
    #[msg("Cannot check — there is a bet to call")]
    CannotCheck,

    /// Betting round is not complete — not all players have acted
    #[msg("Betting round not complete")]
    BettingRoundIncomplete,

    // ─── Phase / Game State Errors ────────────────────────────────────────────

    /// Invalid game state for this action
    #[msg("Invalid game state")]
    InvalidGameState,

    /// Invalid poker phase for this action
    #[msg("Invalid poker phase")]
    InvalidPhase,

    /// Cannot advance phase — betting round not complete
    #[msg("Cannot advance phase — betting incomplete")]
    CannotAdvancePhase,

    /// Game has not reached showdown phase yet
    #[msg("Not in showdown phase")]
    NotInShowdown,

    /// All players have folded except one — game is over
    #[msg("All players folded — game over")]
    AllPlayersFolded,

    // ─── Hand Verification Errors ─────────────────────────────────────────────

    /// Hand not verified before showdown
    #[msg("Hand not verified before showdown")]
    HandNotVerified,

    /// All hands must be verified before showdown can proceed
    #[msg("Not all hands verified")]
    NotAllHandsVerified,

    /// Hand has already been verified
    #[msg("Hand already verified")]
    HandAlreadyVerified,

    /// Player has no cards to verify (folded or not dealt)
    #[msg("Player has no cards to verify")]
    NoCardsToVerify,

    // ─── Pot / Settlement Errors ──────────────────────────────────────────────

    /// Pot account is invalid or does not match expected address
    #[msg("Invalid pot account")]
    InvalidPotAccount,

    /// Player stack account is invalid
    #[msg("Invalid player stack account")]
    InvalidStackAccount,

    /// Pot settlement failed
    #[msg("Pot settlement failed")]
    SettlementFailed,

    /// Cannot settle pot — no winner determined
    #[msg("No winner determined")]
    NoWinner,

    // ─── Timeout Errors ───────────────────────────────────────────────────────

    /// Betting timeout not reached yet
    #[msg("Betting timeout not reached")]
    BettingTimeoutNotReached,

    /// No deadline set for current phase
    #[msg("No deadline set")]
    NoDeadlineSet,

    /// Timeout already triggered for this player
    #[msg("Timeout already triggered")]
    TimeoutAlreadyTriggered,

    // ─── Table / Setup Errors ─────────────────────────────────────────────────

    /// Table is not properly initialized
    #[msg("Table not initialized")]
    TableNotInitialized,

    /// Invalid blind amounts (small blind must be less than big blind)
    #[msg("Invalid blind amounts")]
    InvalidBlindAmounts,

    /// Blinds have not been posted yet
    #[msg("Blinds not posted")]
    BlindsNotPosted,

    /// Blinds have already been posted
    #[msg("Blinds already posted")]
    BlindsAlreadyPosted,

    /// Not enough players to start the hand
    #[msg("Not enough players")]
    NotEnoughPlayers,

    /// Table is full — cannot add more players
    #[msg("Table is full")]
    TableFull,

    // ─── MXE / Computation Errors ─────────────────────────────────────────────

    /// MXE computation was aborted
    #[msg("MXE computation aborted")]
    AbortedComputation,

    /// MXE output verification failed
    #[msg("MXE output verification failed")]
    InvalidMxeOutput,

    /// Computation offset mismatch
    #[msg("Computation offset mismatch")]
    ComputationOffsetMismatch,

    // ─── Arithmetic / Overflow ────────────────────────────────────────────────

    /// Arithmetic overflow
    #[msg("Arithmetic overflow")]
    Overflow,

    /// Arithmetic underflow
    #[msg("Arithmetic underflow")]
    Underflow,
}
