use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

declare_id!("CMZ49EUStUR9gj2PESATssmMu9hLPaUjhkgn8dmd85jY");
mod constants;
mod error;
mod events;
mod helper;
mod instructions;
mod state;
use instructions::*;

#[ephemeral]
#[program]
pub mod diamond_arena {

    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        fee_bps: u8,
    ) -> Result<()> {
        ctx.accounts.handler(treasury, fee_bps, &ctx.bumps)
    }

    pub fn create_room(
        ctx: Context<CreateRoom>,
        room_id: u64,
        entry_fee: u64,
        max_players: u8,
    ) -> Result<()> {
        ctx.accounts
            .handler(room_id, entry_fee, max_players, &ctx.bumps)
    }

    pub fn join_room(ctx: Context<JoinRoom>, room_id: u64) -> Result<()> {
        ctx.accounts.handler(room_id, &ctx.bumps)
    }

    pub fn start_match(ctx: Context<StartMatch>, room_id: u64) -> Result<()> {
        ctx.accounts.handler(room_id)
    }

    pub fn submit_pick(ctx: Context<SubmitPick>, room_id: u64, round: u8, pick: u8) -> Result<()> {
        ctx.accounts.handler(room_id, round, pick)
    }

    pub fn finalize_round<'info>(
        ctx: Context<'_, '_, 'info, 'info, FinalizeRound<'info>>,
        room_id: u64,
    ) -> Result<()> {
        ctx.accounts.handler(room_id, &ctx.remaining_accounts)
    }

    pub fn settle_match(ctx: Context<SettleMatch>, room_id: u64) -> Result<()> {
        ctx.accounts.handler(room_id)
    }

    pub fn cancel_room(ctx: Context<CancelRoom>, room_id: u64) -> Result<()> {
        ctx.accounts.handler(room_id)
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>, room_id: u64) -> Result<()> {
        ctx.accounts.handler(room_id)
    }

    pub fn close_player_accounts(ctx: Context<ClosePlayerAccounts>, room_id: u64) -> Result<()> {
        ctx.accounts.handler(room_id)
    }

    pub fn delegate_input(ctx: Context<DelegateInput>, input: DelegateTarget) -> Result<()> {
        delegate(ctx, input)
    }

    pub fn undelegate<'info>(
        ctx: Context<'_, '_, '_, 'info, Undelegate<'info>>,
        room_id: u64,
    ) -> Result<()> {
        undelegate_handler(ctx, room_id)
    }
}
