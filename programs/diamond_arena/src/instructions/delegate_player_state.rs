use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::{
    constants::PLAYER_STATE_SEED,
    error::DiamondError,
    state::{PlayerState, PlayerStatus},
};

#[delegate]
#[derive(Accounts)]
#[instruction(room_id: u64, player: Pubkey)]
pub struct DelegatePlayerState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: optional validator passed through remaining accounts
    pub validator: Option<AccountInfo<'info>>,

    #[account(
        mut,
        del,
        seeds = [PLAYER_STATE_SEED, &room_id.to_le_bytes(), player.as_ref()],
        bump = player_state.bump,
        constraint = player_state.room_id == room_id @ DiamondError::InvalidRoom,
        constraint = player_state.player == player @ DiamondError::PlayerNotFound,
        constraint = player_state.status == PlayerStatus::Active @ DiamondError::PlayerNotActive,
    )]
    pub player_state: Account<'info, PlayerState>,
}

impl<'info> DelegatePlayerState<'info> {
    pub fn handler(ctx: Context<DelegatePlayerState>, room_id: u64, player: Pubkey) -> Result<()> {
        ctx.accounts.delegate_player_state(
            &ctx.accounts.payer,
            &[PLAYER_STATE_SEED, &room_id.to_le_bytes(), player.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                commit_frequency_ms: 3_000,
                ..Default::default()
            },
        )?;

        Ok(())
    }
}
