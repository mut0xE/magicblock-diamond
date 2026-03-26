use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_accounts};

use crate::{
    constants::ROOM_SEED,
    error::DiamondError,
    state::{Room, RoomStatus},
};
#[commit]
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct CommitAndUndelegate<'info> {
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

pub fn commit_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, CommitAndUndelegate<'info>>,
    _room_id: u64,
) -> Result<()> {
    ctx.accounts.room.exit(&crate::ID)?;

    let payer_info = ctx.accounts.payer.to_account_info();
    let room_info = ctx.accounts.room.to_account_info();
    let magic_context_info = ctx.accounts.magic_context.to_account_info();
    let magic_program_info = ctx.accounts.magic_program.to_account_info();

    let mut accounts_to_commit: Vec<&AccountInfo<'info>> = Vec::new();
    accounts_to_commit.push(&room_info);

    for acc in ctx.remaining_accounts.iter() {
        accounts_to_commit.push(acc);
    }

    commit_accounts(
        &payer_info,
        accounts_to_commit,
        &magic_context_info,
        &magic_program_info,
    )?;

    Ok(())
}
