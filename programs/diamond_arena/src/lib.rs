use anchor_lang::prelude::*;

declare_id!("E6ZxrJxuJ2mcAuqSU5JD3GdWYWWkxUddz4i8QqujFxR2");

#[program]
pub mod diamond_arena {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
