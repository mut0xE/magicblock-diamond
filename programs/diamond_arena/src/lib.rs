use anchor_lang::prelude::*;

declare_id!("E6ZxrJxuJ2mcAuqSU5JD3GdWYWWkxUddz4i8QqujFxR2");
mod constants;
mod error;
mod instructions;
mod state;

use instructions::*;
use state::*;

#[program]
pub mod diamond_arena {
    use super::*;

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
        ctx.accounts.handler(room_id, round, pick, &ctx.bumps)
    }
}
