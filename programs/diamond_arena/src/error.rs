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
}
