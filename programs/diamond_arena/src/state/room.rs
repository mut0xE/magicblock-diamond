use anchor_lang::prelude::*;

use crate::constants::MIN_PLAYERS;

#[derive(AnchorDeserialize, AnchorSerialize, Clone, PartialEq, Eq, InitSpace)]
pub enum RoomStatus {
    Waiting,
    Active,
    Finished,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Room {
    pub creator: Pubkey,
    pub winner: Option<Pubkey>,

    pub room_id: u64,
    pub entry_fee: u64,

    pub created_at: i64,
    pub commit_deadline: i64,
    pub reveal_deadline: i64,

    pub prize_pool: u64,

    pub max_players: u8,
    pub current_players: u8,
    /// Number of currently active (non-eliminated) players
    pub active_players: u8,
    pub current_round: u8,
    /// Number of players eliminated so far (controls progressive rule unlocking)
    pub eliminations: u8,
    pub settled: bool,

    pub status: RoomStatus,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Room {
    /// Check if game can start (MIN_PLAYERS)
    pub fn can_start(&self) -> bool {
        self.current_players >= MIN_PLAYERS && self.status == RoomStatus::Waiting
    }

    /// Check if this is the final round (2 or fewer active players)
    pub fn is_final_round(&self) -> bool {
        self.active_players <= 2
    }

    /// Rule 1 active: collision invalidation (after 1st elimination)
    pub fn rule1_active(&self) -> bool {
        self.eliminations >= 1
    }

    /// Rule 2 active: exact match bonus (after 2nd elimination)
    pub fn rule2_active(&self) -> bool {
        self.eliminations >= 2
    }

    /// Rule 3 active: zero-hundred rule (after 3rd elimination)
    pub fn rule3_active(&self) -> bool {
        self.eliminations >= 3
    }
}
