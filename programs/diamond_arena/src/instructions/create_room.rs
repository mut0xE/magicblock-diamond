use anchor_lang::prelude::*;

use crate::{
    constants::{DISCRIMINATOR, MAX_PLAYERS, MIN_ENTRY_FEE, MIN_PLAYERS, ROOM_SEED, VAULT_SEED},
    error::DiamondError,
    events,
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

    /// Vault account to hold all entry fees (system account)
    #[account(
            mut,
            seeds = [VAULT_SEED, &room_id.to_le_bytes()],
            bump
        )]
    pub vault: SystemAccount<'info>,

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

        // Validate minimum entry fee
        require!(entry_fee >= MIN_ENTRY_FEE, DiamondError::EntryFeeTooLow);

        let now = Clock::get()?.unix_timestamp;

        // Initialize room
        self.room.set_inner(Room {
            creator: self.creator.key(),
            winner: None,
            room_id,
            entry_fee,
            created_at: now,
            commit_deadline: 0,
            reveal_deadline: 0,
            prize_pool: 0,
            max_players,
            current_players: 0,
            active_players: 0,
            current_round: 0,
            eliminations: 0,
            status: RoomStatus::Waiting,
            bump: bumps.room,
            vault_bump: bumps.vault,
            settled: false,
        });

        emit!(events::RoomCreated {
            room_id,
            creator: self.creator.key(),
            entry_fee,
            max_players,
        });

        Ok(())
    }
}
