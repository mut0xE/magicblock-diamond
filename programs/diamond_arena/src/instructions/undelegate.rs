use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

use crate::{
    constants::ROOM_SEED,
    error::DiamondError,
    state::{Room, RoomStatus},
};

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
    _room_id: u64,
) -> Result<()> {
    let mut accounts_to_undelegate = vec![ctx.accounts.room.to_account_info()];
    for acc in ctx.remaining_accounts.iter() {
        accounts_to_undelegate.push(acc.to_account_info());
    }

    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&accounts_to_undelegate)
    .build_and_invoke()?;

    Ok(())
}
