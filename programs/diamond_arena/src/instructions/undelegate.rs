use crate::{
    constants::ROOM_SEED,
    error::DiamondError,
    state::{Room, RoomStatus},
};
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_and_undelegate_accounts};

#[commit]
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct Undelegate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, &room_id.to_le_bytes()],
        bump = room.bump,
        constraint = room.status == RoomStatus::Finished @ DiamondError::MatchNotFinished,
    )]
    pub room: Account<'info, Room>,
}

pub fn undelegate_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Undelegate<'info>>,
    _auction_id: u64,
) -> Result<()> {
    let room_info = &ctx.accounts.room.to_account_info();
    let mut accounts_to_undelegate: Vec<&AccountInfo<'info>> = Vec::new();
    accounts_to_undelegate.push(room_info);

    for acc in ctx.remaining_accounts.iter() {
        accounts_to_undelegate.push(acc);
    }
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        accounts_to_undelegate,
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}
