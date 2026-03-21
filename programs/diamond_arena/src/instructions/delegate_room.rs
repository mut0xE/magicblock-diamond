use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::delegate, cpi::DelegateConfig};

use crate::{constants::ROOM_SEED, state::Room};
#[delegate]
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct DelegateRoom<'info> {
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program
    pub validator: Option<AccountInfo<'info>>,
    /// CHECK The pda to delegate
    /// CHECK: this PDA is validated by seeds below and by the delegate macro/program
    #[account(mut, del)]
    pub room: Account<'info, Room>,
}

impl<'info> DelegateRoom<'info> {
    pub fn handler(ctx: Context<DelegateRoom>, room_id: u64) -> Result<()> {
        ctx.accounts.delegate_room(
            &ctx.accounts.payer,
            &[ROOM_SEED, &room_id.to_le_bytes()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                commit_frequency_ms: 3_000,
                ..Default::default()
            },
        )?;

        Ok(())
    }
}
