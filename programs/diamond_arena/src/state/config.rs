use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct Config {
    pub admin: Pubkey,    // who can update config
    pub treasury: Pubkey, // where fees go
    pub fee_bps: u8,      // protocol fee in basis points
    pub bump: u8,
}
