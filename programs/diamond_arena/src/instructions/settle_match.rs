use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::CONFIG_SEED;
use crate::state::Config;
use crate::{
    constants::{ROOM_SEED, VAULT_SEED},
    error::DiamondError,
    state::{Room, RoomStatus},
};

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct SettleMatch<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
            mut,
            seeds = [ROOM_SEED, &room_id.to_le_bytes()],
            bump = room.bump,
            constraint = room.status == RoomStatus::Finished @ DiamondError::MatchNotFinished,
        )]
    pub room: Account<'info, Room>,

    #[account(
            mut,
            seeds = [VAULT_SEED, &room_id.to_le_bytes()],
            bump
        )]
    pub vault: SystemAccount<'info>,

    /// CHECK: validated against room winner
    #[account(
           mut,
           constraint = room.winner == Some(winner.key()) @ DiamondError::InvalidWinner
       )]
    pub winner: AccountInfo<'info>,

    #[account(
               seeds = [CONFIG_SEED],
               bump = config.bump,
           )]
    pub config: Account<'info, Config>,

    #[account(
               mut,
               constraint = treasury.key() == config.treasury @ DiamondError::InvalidTreasury
           )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}
impl<'info> SettleMatch<'info> {
    pub fn handler(&mut self, _room_id: u64) -> Result<()> {
        let room = &mut self.room;
        let prize_pool = room.prize_pool;
        let fee_bps = self.config.fee_bps;

        require!(prize_pool > 0, DiamondError::NoPrizeToClaim);
        require!(!room.settled, DiamondError::AlreadySettled);

        // Calculate fee and payout
        let fee = room
            .prize_pool
            .checked_mul(fee_bps as u64)
            .ok_or(DiamondError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(DiamondError::MathOverflow)?;

        let payout = room
            .prize_pool
            .checked_sub(fee)
            .ok_or(DiamondError::MathOverflow)?;

        let room_id_bytes = room.room_id.to_le_bytes();
        let vault_seeds = &[VAULT_SEED, room_id_bytes.as_ref(), &[room.vault_bump]];

        // Transfer fee to treasury
        if fee > 0 {
            transfer(
                CpiContext::new_with_signer(
                    self.system_program.to_account_info(),
                    Transfer {
                        from: self.vault.to_account_info(),
                        to: self.treasury.to_account_info(),
                    },
                    &[vault_seeds],
                ),
                fee,
            )?;
            msg!("Treasury received {} lamports ({} bps fee)", fee, fee_bps);
        }

        // Transfer payout to winner
        if payout > 0 {
            transfer(
                CpiContext::new_with_signer(
                    self.system_program.to_account_info(),
                    Transfer {
                        from: self.vault.to_account_info(),
                        to: self.winner.to_account_info(),
                    },
                    &[vault_seeds],
                ),
                payout,
            )?;
            msg!("Winner {} received {} lamports", self.winner.key(), payout);
        }
        room.settled = true;

        msg!(
            "Match settled! Total: {} | Fee: {} | Payout: {}",
            prize_pool,
            fee,
            payout
        );

        Ok(())
    }
}
