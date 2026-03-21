use anchor_lang::prelude::*;

use crate::constants::MIN_PLAYERS;
#[derive(AnchorDeserialize, AnchorSerialize, Clone, PartialEq, Eq, InitSpace)]
pub enum RoomStatus {
    Waiting,
    Active,
    Finished,
}

#[account]
#[derive(InitSpace)]
pub struct Room {
    pub creator: Pubkey, // Room creator
    pub winner: Option<Pubkey>,

    pub room_id: u64,   // Unique match ID
    pub entry_fee: u64, // Cost to join (lamports)

    pub commit_deadline: i64,
    pub reveal_deadline: i64,

    pub prize_pool: u64, // total deposited by players
    pub protocol_fee_bps: u8,

    pub max_players: u8, // all entry fees
    pub current_players: u8,
    pub current_round: u8,

    pub status: RoomStatus,
    pub bump: u8,
}

impl Room {
    /// Check if game can start (MIN_PLAYERS)
    pub fn can_start(&self) -> bool {
        self.current_players >= MIN_PLAYERS && self.status == RoomStatus::Waiting
    }

    /// Check if this is the final round (2 or fewer players)
    pub fn is_final_round(&self) -> bool {
        self.current_players <= 2
    }
}
