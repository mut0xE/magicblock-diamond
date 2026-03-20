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

    pub lives: u8,
    pub status: PlayerStatus,

    pub joined_at_round: u8,
    pub bump: u8,
}
