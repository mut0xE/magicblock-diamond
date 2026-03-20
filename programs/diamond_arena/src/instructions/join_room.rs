use anchor_lang::{prelude::*, system_program::Transfer};

use crate::{
    constants::{DEFAULT_LIVES, DISCRIMINATOR, PLAYER_STATE_SEED, ROOM_SEED, VAULT_SEED},
    error::DiamondError,
    state::{PlayerState, PlayerStatus, Room, RoomStatus},
};

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
            mut,
            seeds = [ROOM_SEED, &room_id.to_le_bytes()],
            bump = room.bump,
            constraint = room.status == RoomStatus::Waiting @DiamondError::RoomNotWaiting,
            constraint = room.current_players < room.max_players @ DiamondError::RoomFull
        )]
    pub room: Account<'info, Room>,

    #[account(
            init,
            payer = player,
            space = DISCRIMINATOR + PlayerState::INIT_SPACE,
            seeds = [PLAYER_STATE_SEED, &room_id.to_le_bytes(), player.key().as_ref()],
            bump
        )]
    pub player_state: Account<'info, PlayerState>,

    /// Vault account to hold all entry fees (system account)
    #[account(
            mut,
            seeds = [VAULT_SEED, &room_id.to_le_bytes()],
            bump
        )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> JoinRoom<'info> {
    pub fn handler(&mut self, room_id: u64, bumps: &JoinRoomBumps) -> Result<()> {
        // Transfer entry fee from player to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                Transfer {
                    from: self.player.to_account_info(),
                    to: self.vault.to_account_info(),
                },
            ),
            self.room.entry_fee,
        )?;

        // Initialize PlayerState
        self.player_state.set_inner(PlayerState {
            room_id,
            player: self.player.key(),
            lives: DEFAULT_LIVES,
            status: PlayerStatus::Active,
            joined_at_round: 0,
            bump: bumps.player_state,
        });

        // Update room: increment players and prize pool
        let room = &mut self.room;

        room.current_players = room
            .current_players
            .checked_add(1)
            .ok_or(DiamondError::MathOverflow)?;

        room.prize_pool = room
            .prize_pool
            .checked_add(room.entry_fee)
            .ok_or(DiamondError::MathOverflow)?;

        Ok(())
    }
}
