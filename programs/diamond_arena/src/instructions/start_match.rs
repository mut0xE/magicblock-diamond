use anchor_lang::prelude::*;

use crate::{
    constants::{COMMIT_DURATION, PLAYER_STATE_SEED, REVEAL_DURATION, ROOM_SEED},
    error::DiamondError,
    events,
    state::{PlayerState, PlayerStatus, Room, RoomStatus},
};

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct StartMatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, &room_id.to_le_bytes()],
        bump = room.bump,
        constraint = room.status == RoomStatus::Waiting @ DiamondError::RoomNotWaiting,
        constraint = room.current_players >= 2 @ DiamondError::NotEnoughPlayers,
    )]
    pub room: Account<'info, Room>,

    /// Caller must be a joined player (verified via their PlayerState PDA)
    #[account(
        seeds = [PLAYER_STATE_SEED, &room_id.to_le_bytes(), authority.key().as_ref()],
        bump = player_state.bump,
        constraint = player_state.status == PlayerStatus::Active @ DiamondError::PlayerNotActive,
    )]
    pub player_state: Account<'info, PlayerState>,
}

impl<'info> StartMatch<'info> {
    pub fn handler(&mut self, _room_id: u64) -> Result<()> {
        let room = &mut self.room;

        let now = Clock::get()?.unix_timestamp;

        room.status = RoomStatus::Active;
        room.active_players = room.current_players;
        room.current_round = room
            .current_round
            .checked_add(1)
            .ok_or(DiamondError::MathOverflow)?;
        room.commit_deadline = now + COMMIT_DURATION;
        room.reveal_deadline = now + COMMIT_DURATION + REVEAL_DURATION;

        emit!(events::MatchStarted {
            room_id: room.room_id,
            active_players: room.active_players,
            round: room.current_round,
            commit_deadline: room.commit_deadline,
            reveal_deadline: room.reveal_deadline,
        });

        Ok(())
    }
}
