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
}
