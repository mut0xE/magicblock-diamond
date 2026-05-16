use anchor_lang::prelude::*;

#[derive(AnchorDeserialize, AnchorSerialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PlayerStatus {
    Active,
    Eliminated,
    Winner,
}

#[account]
#[derive(InitSpace)]
pub struct PlayerState {
    pub room_id: u64,
    pub player: Pubkey,

    /// Minus points: starts at 0, goes negative. Eliminated at -10.
    pub minus_points: i8,
    pub status: PlayerStatus,

    pub joined_at_round: u8,
    pub bump: u8,
}
