use anchor_lang::prelude::*;

#[error_code]
pub enum DiamondError {
    #[msg("Invalid max players.")]
    InvalidMaxPlayers,

    #[msg("Room is already full.")]
    RoomFull,

    #[msg("Player already joined.")]
    PlayerAlreadyJoined,

    #[msg("Room is not in waiting state.")]
    RoomNotWaiting,

    #[msg("Math overflow.")]
    MathOverflow,

    #[msg("Math underflow.")]
    MathUnderflow,

    #[msg("Player has already committed for this round.")]
    AlreadyCommitted,

    #[msg("Not enough players to start the match.")]
    NotEnoughPlayers,

    #[msg("Commit phase is over.")]
    CommitPhaseOver,

    #[msg("Invalid pick. Must be between 0 and 100.")]
    InvalidPick,

    #[msg("Invalid round.")]
    InvalidRound,

    #[msg("Player is not active.")]
    PlayerNotActive,

    #[msg("Room is not active.")]
    RoomNotActive,

    #[msg("Not enough active players.")]
    NotEnoughActivePlayers,

    #[msg("Missing round choice for player.")]
    MissingRoundChoice,

    #[msg("Player has not committed.")]
    PlayerNotCommitted,

    #[msg("Player has not revealed.")]
    PlayerNotRevealed,

    #[msg("Pick not submitted.")]
    PickNotSubmitted,

    #[msg("No players in round.")]
    NoPlayersInRound,

    #[msg("Player not found.")]
    PlayerNotFound,

    #[msg("Reveal phase is not over yet")]
    RevealPhaseNotOver,

    #[msg("Match is not finished.")]
    MatchNotFinished,

    #[msg("Winner not set.")]
    WinnerNotSet,

    #[msg("Invalid winner account.")]
    InvalidWinner,

    #[msg("Match already settled.")]
    AlreadySettled,

    #[msg("No prize to claim")]
    NoPrizeToClaim,

    #[msg("Invalid Room")]
    InvalidRoom,

    #[msg("Treasury account does not match config")]
    InvalidTreasury,

    #[msg("Program data account does not match this program")]
    ProgramDataMismatch,

    #[msg("Signer is not the program upgrade authority")]
    UpgradeAuthorityMismatch,

    #[msg("Player state PDA does not match expected derivation")]
    InvalidPlayerStatePda,

    #[msg("Player choice PDA does not match expected derivation")]
    InvalidPlayerChoicePda,

    #[msg("Entry fee is below the minimum required")]
    EntryFeeTooLow,

    #[msg("All players were eliminated, no winner")]
    AllPlayersEliminated,

    #[msg("Not all active players are accounted for in remaining accounts")]
    MissingActivePlayers,

    #[msg("Room has been cancelled")]
    RoomCancelled,

    #[msg("Room is not cancelled, cannot claim refund")]
    RoomNotCancelled,

    #[msg("Room has not timed out yet")]
    RoomNotTimedOut,

    #[msg("Room is not in a terminal state (finished or cancelled)")]
    RoomNotTerminal,

    #[msg("Fee basis points too high")]
    FeeBpsTooHigh,
}
