use anchor_lang::prelude::*;

use crate::{
    constants::{DISCRIMINATOR, MAX_PLAYERS, MIN_PLAYERS, PROTOCOL_FEE_BPS, ROOM_SEED},
    error::DiamondError,
    state::{Room, RoomStatus},
};

#[derive(Accounts)]
#[instruction[room_id: u64]]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = DISCRIMINATOR + Room::INIT_SPACE,
        seeds = [ROOM_SEED, &room_id.to_le_bytes()],
        bump
    )]
    pub room: Account<'info, Room>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateRoom<'info> {
    pub fn handler(
        &mut self,
        room_id: u64,
        entry_fee: u64,
        max_players: u8,
        bumps: &CreateRoomBumps,
    ) -> Result<()> {
        // Validate max players
        require!(
            max_players >= MIN_PLAYERS && max_players <= MAX_PLAYERS,
            DiamondError::InvalidMaxPlayers
        );

        // Initialize room
        self.room.set_inner(Room {
            creator: self.creator.key(),
            winner: None,
            room_id,
            entry_fee,
            commit_deadline: 0,
            reveal_deadline: 0,
            prize_pool: 0,
            protocol_fee_bps: PROTOCOL_FEE_BPS,
            max_players,
            current_players: 0,
            current_round: 0,
            status: RoomStatus::Waiting,
            bump: bumps.room,
        });
        Ok(())
    }
}
