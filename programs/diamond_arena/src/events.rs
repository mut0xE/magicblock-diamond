use anchor_lang::prelude::*;

#[event]
pub struct RoomCreated {
    pub room_id: u64,
    pub creator: Pubkey,
    pub entry_fee: u64,
    pub max_players: u8,
}

#[event]
pub struct PlayerJoined {
    pub room_id: u64,
    pub player: Pubkey,
    pub current_players: u8,
}

#[event]
pub struct MatchStarted {
    pub room_id: u64,
    pub active_players: u8,
    pub round: u8,
    pub commit_deadline: i64,
    pub reveal_deadline: i64,
}

#[event]
pub struct RoundFinalized {
    pub room_id: u64,
    pub round: u8,
    pub winner: Option<Pubkey>,
    pub eliminations_this_round: u8,
    pub total_eliminations: u8,
    pub active_players: u8,
    pub rule1_active: bool,
    pub rule2_active: bool,
    pub rule3_active: bool,
}

#[event]
pub struct MatchFinished {
    pub room_id: u64,
    pub winner: Option<Pubkey>,
    pub total_rounds: u8,
}

#[event]
pub struct MatchSettled {
    pub room_id: u64,
    pub winner: Pubkey,
    pub payout: u64,
    pub fee: u64,
}

#[event]
pub struct RoomCancelled {
    pub room_id: u64,
    pub creator: Pubkey,
    pub players_to_refund: u8,
}

#[event]
pub struct RefundClaimed {
    pub room_id: u64,
    pub player: Pubkey,
    pub amount: u64,
}
