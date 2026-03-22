use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::delegate, cpi::DelegateConfig};

use crate::{constants::PLAYER_ROUND_CHOICE_SEED, state::PlayerRoundChoice};

#[delegate]
#[derive(Accounts)]
#[instruction(room_id: u64, player: Pubkey)]
pub struct DelegatePlayerRoundChoice<'info> {
    pub payer: Signer<'info>,

    /// CHECK: checked by delegate program
    pub validator: Option<AccountInfo<'info>>,

    #[account(mut, del)]
    pub player_round_choice: Account<'info, PlayerRoundChoice>,
}

impl<'info> DelegatePlayerRoundChoice<'info> {
    pub fn handler(
        ctx: Context<DelegatePlayerRoundChoice>,
        room_id: u64,
        player: Pubkey,
    ) -> Result<()> {
        ctx.accounts.delegate_player_round_choice(
            &ctx.accounts.payer,
            &[
                PLAYER_ROUND_CHOICE_SEED,
                &room_id.to_le_bytes(),
                player.as_ref(),
            ],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                commit_frequency_ms: 3_000,
                ..Default::default()
            },
        )?;

        Ok(())
    }
}
