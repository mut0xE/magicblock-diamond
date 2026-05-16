use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{
    constants::{
        PLAYER_STATE_SEED, ROOM_SEED, ROOM_WAIT_TIMEOUT, ROUND_ABANDON_TIMEOUT, VAULT_SEED,
    },
    error::DiamondError,
    events,
    state::{PlayerState, Room, RoomStatus},
};

/// Cancel a room. Two cases:
/// 1. Creator can cancel anytime while room is Waiting
/// 2. Any joined player can cancel if room has been Waiting longer than ROOM_WAIT_TIMEOUT
/// 3. Any joined player can cancel an Active room if round is abandoned (reveal_deadline + ROUND_ABANDON_TIMEOUT passed)
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct CancelRoom<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOM_SEED, &room_id.to_le_bytes()],
        bump = room.bump,
    )]
    pub room: Account<'info, Room>,

    /// Caller's player state PDA proves they joined this room
    #[account(
        seeds = [PLAYER_STATE_SEED, &room_id.to_le_bytes(), caller.key().as_ref()],
        bump = player_state.bump,
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(
        mut,
        seeds = [VAULT_SEED, &room_id.to_le_bytes()],
        bump = room.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CancelRoom<'info> {
    pub fn handler(&mut self, _room_id: u64) -> Result<()> {
        let room = &mut self.room;
        let now = Clock::get()?.unix_timestamp;
        let is_creator = room.creator == self.caller.key();

        match room.status {
            RoomStatus::Waiting => {
                if is_creator {
                    // Creator can cancel anytime while Waiting
                } else {
                    // Non-creator can cancel only after timeout
                    let elapsed = now.saturating_sub(room.created_at);
                    require!(elapsed >= ROOM_WAIT_TIMEOUT, DiamondError::RoomNotTimedOut);
                }
            }
            RoomStatus::Active => {
                // Anyone can cancel if round is abandoned
                // (reveal deadline passed + abandon timeout)
                let abandon_deadline = room.reveal_deadline.saturating_add(ROUND_ABANDON_TIMEOUT);
                require!(now >= abandon_deadline, DiamondError::RoomNotTimedOut);
            }
            _ => {
                return Err(DiamondError::RoomNotWaiting.into());
            }
        }

        room.status = RoomStatus::Cancelled;

        emit!(events::RoomCancelled {
            room_id: room.room_id,
            creator: room.creator,
            players_to_refund: room.current_players,
        });

        msg!(
            "Room {} cancelled. Players to refund: {}",
            room.room_id,
            room.current_players
        );

        Ok(())
    }
}

/// Players claim their entry fee back from a cancelled room.
/// Each player calls this individually. Closes their PlayerState to return rent.
#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        seeds = [ROOM_SEED, &room_id.to_le_bytes()],
        bump = room.bump,
        constraint = room.status == RoomStatus::Cancelled @ DiamondError::RoomNotCancelled,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        seeds = [VAULT_SEED, &room_id.to_le_bytes()],
        bump = room.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Player's state account - closed on refund, rent returned to player
    #[account(
        mut,
        close = player,
        constraint = player_state.player == player.key() @ DiamondError::PlayerNotFound,
        constraint = player_state.room_id == room_id @ DiamondError::PlayerNotFound,
    )]
    pub player_state: Account<'info, PlayerState>,

    pub system_program: Program<'info, System>,
}

impl<'info> ClaimRefund<'info> {
    pub fn handler(&mut self, _room_id: u64) -> Result<()> {
        let room = &self.room;
        let refund_amount = room.entry_fee;

        let room_id_bytes = room.room_id.to_le_bytes();
        let vault_seeds = &[VAULT_SEED, room_id_bytes.as_ref(), &[room.vault_bump]];

        if refund_amount > 0 {
            transfer(
                CpiContext::new_with_signer(
                    self.system_program.to_account_info(),
                    Transfer {
                        from: self.vault.to_account_info(),
                        to: self.player.to_account_info(),
                    },
                    &[vault_seeds],
                ),
                refund_amount,
            )?;
        }

        emit!(events::RefundClaimed {
            room_id: room.room_id,
            player: self.player.key(),
            amount: refund_amount,
        });

        msg!(
            "Refunded {} lamports to player {}",
            refund_amount,
            self.player.key()
        );

        Ok(())
    }
}
