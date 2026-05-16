use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, DISCRIMINATOR, MAX_FEE_BPS},
    error::DiamondError,
    program::DiamondArena,
    state::Config,
};
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = DISCRIMINATOR + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,

    // Ensures only the program deployer can initialize config
    #[account(
            constraint = this_program.programdata_address()? == Some(program_data.key())
                @ DiamondError::ProgramDataMismatch
        )]
    pub this_program: Program<'info, DiamondArena>,

    #[account(
            constraint = program_data.upgrade_authority_address == Some(admin.key())
                @ DiamondError::UpgradeAuthorityMismatch
        )]
    pub program_data: Account<'info, ProgramData>,
}

impl<'info> InitializeConfig<'info> {
    pub fn handler(
        &mut self,
        treasury: Pubkey,
        fee_bps: u8,
        bumps: &InitializeConfigBumps,
    ) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, DiamondError::FeeBpsTooHigh);

        let config = &mut self.config;

        config.set_inner(Config {
            admin: self.admin.key(),
            treasury,
            fee_bps,
            bump: bumps.config,
        });
        msg!(
            "Config initialized | admin: {} | treasury: {} | fee_bps: {}",
            config.admin,
            config.treasury,
            config.fee_bps,
        );

        Ok(())
    }
}
