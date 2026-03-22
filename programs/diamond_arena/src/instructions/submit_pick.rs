use crate::{
    constants::{MAX_NUMBER, PLAYER_ROUND_CHOICE_SEED, PLAYER_STATE_SEED, ROOM_SEED},
    error::DiamondError,
    state::{PlayerRoundChoice, PlayerState, PlayerStatus, Room, RoomStatus},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(room_id: u64, round: u8)]
pub struct SubmitPick<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
            mut,
            seeds = [ROOM_SEED, &room_id.to_le_bytes()],
            bump = room.bump,
            constraint = room.status == RoomStatus::Active @ DiamondError::RoomNotActive,
        )]
    pub room: Account<'info, Room>,

    #[account(
            mut,
            seeds = [PLAYER_STATE_SEED, &room_id.to_le_bytes(), player.key().as_ref()],
            bump = player_state.bump,
            constraint = player_state.status == PlayerStatus::Active @ DiamondError::PlayerNotActive,
        )]
    pub player_state: Account<'info, PlayerState>,

    #[account(
          mut,
           seeds = [
               PLAYER_ROUND_CHOICE_SEED,
               &room_id.to_le_bytes(),
               player.key().as_ref()
           ],
           bump
       )]
    pub player_round_choice: Account<'info, PlayerRoundChoice>,

    pub system_program: Program<'info, System>,
}
impl<'info> SubmitPick<'info> {
    pub fn handler(&mut self, _room_id: u64, round: u8, pick: u8) -> Result<()> {
        let room = &self.room;
        let choice = &mut self.player_round_choice;

        require!(pick <= MAX_NUMBER, DiamondError::InvalidPick);
        require!(round == room.current_round, DiamondError::InvalidRound);

        let now = Clock::get()?.unix_timestamp;
        require!(now <= room.commit_deadline, DiamondError::CommitPhaseOver);

        require!(choice.round != round, DiamondError::AlreadyCommitted);

        choice.committed = true;
        choice.pick = Some(pick);
        choice.round = round;
        choice.timestamp = now;
        Ok(())
    }
}
