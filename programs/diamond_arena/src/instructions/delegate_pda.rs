use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::delegate, cpi::DelegateConfig};

use crate::constants::{PLAYER_ROUND_CHOICE_SEED, PLAYER_STATE_SEED, ROOM_SEED};
#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    pub payer: Signer<'info>,
    /// CHECK The pda to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}
pub fn delegate(ctx: Context<DelegateInput>, input: DelegateTarget) -> Result<()> {
    let seed_bytes = input.get_seeds_bytes();
    msg!("seed bytes {:#?}", seed_bytes);
    let seed_refs: Vec<&[u8]> = seed_bytes.iter().map(|s| s.as_slice()).collect();
    msg!("seed refs {:#?}", seed_refs);

    ctx.accounts.delegate_pda(
        &ctx.accounts.payer,
        &seed_refs,
        DelegateConfig {
            // Optionally set a specific validator from the first remaining account
            validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
            ..Default::default()
        },
    )?;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum DelegateTarget {
    Room { room_id: u64 },
    PlayerState { room_id: u64, player: Pubkey },
    PlayerChoice { room_id: u64, player: Pubkey },
}
impl DelegateTarget {
    fn get_seeds_bytes(self) -> Vec<Vec<u8>> {
        match self {
            Self::Room { room_id } => {
                vec![ROOM_SEED.to_vec(), room_id.to_le_bytes().to_vec()]
            }
            Self::PlayerState { room_id, player } => {
                vec![
                    PLAYER_STATE_SEED.to_vec(),
                    room_id.to_le_bytes().to_vec(),
                    player.to_bytes().to_vec(),
                ]
            }
            Self::PlayerChoice { room_id, player } => {
                vec![
                    PLAYER_ROUND_CHOICE_SEED.to_vec(),
                    room_id.to_le_bytes().to_vec(),
                    player.to_bytes().to_vec(),
                ]
            }
        }
    }
}
