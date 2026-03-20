use anchor_lang::prelude::*;

use crate::{
    constants::{COMMIT_DURATION, REVEAL_DURATION, ROOM_SEED},
    error::DiamondError,
    state::{Room, RoomStatus},
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
}

impl<'info> StartMatch<'info> {
    pub fn handler(&mut self, _room_id: u64) -> Result<()> {
        let room = &mut self.room;

        let now = Clock::get()?.unix_timestamp;

        room.status = RoomStatus::Active;
        room.current_round = room
            .current_round
            .checked_add(1)
            .ok_or(DiamondError::MathOverflow)?;
        room.commit_deadline = now + COMMIT_DURATION;
        room.reveal_deadline = now + COMMIT_DURATION + REVEAL_DURATION;

        Ok(())
    }
}
