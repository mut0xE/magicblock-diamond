use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PlayerRoundChoice {
    pub room_id: u64,
    pub round: u8,
    pub player: Pubkey,

    pub pick: Option<u8>, // 0–100
    pub committed: bool,
    pub revealed: bool,

    pub bump: u8,
}
