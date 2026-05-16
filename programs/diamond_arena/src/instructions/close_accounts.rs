use anchor_lang::prelude::*;

use crate::{
    constants::{PLAYER_ROUND_CHOICE_SEED, PLAYER_STATE_SEED, ROOM_SEED},
    error::DiamondError,
    state::{PlayerRoundChoice, PlayerState, Room, RoomStatus},
};

/// Close a player's state and round choice accounts after the game is finished or cancelled.
/// The rent is returned to the player. Can be called by the player themselves.
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct ClosePlayerAccounts<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        seeds = [ROOM_SEED, &room_id.to_le_bytes()],
        bump = room.bump,
        constraint = room.status == RoomStatus::Finished || room.status == RoomStatus::Cancelled
            @ DiamondError::RoomNotTerminal,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        close = player,
        seeds = [PLAYER_STATE_SEED, &room_id.to_le_bytes(), player.key().as_ref()],
        bump = player_state.bump,
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(
        mut,
        close = player,
        seeds = [PLAYER_ROUND_CHOICE_SEED, &room_id.to_le_bytes(), player.key().as_ref()],
        bump = player_round_choice.bump,
    )]
    pub player_round_choice: Account<'info, PlayerRoundChoice>,
}

impl<'info> ClosePlayerAccounts<'info> {
    pub fn handler(&mut self, _room_id: u64) -> Result<()> {
        msg!(
            "Closed accounts for player {} in room {}",
            self.player.key(),
            self.room.room_id
        );
        Ok(())
    }
}
