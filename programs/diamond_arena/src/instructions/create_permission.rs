use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    access_control::{
        instructions::CreatePermissionCpiBuilder,
        structs::{Member, MembersArgs},
    },
    consts::PERMISSION_PROGRAM_ID,
};

use crate::constants::{PLAYER_ROUND_CHOICE_SEED, PLAYER_STATE_SEED, ROOM_SEED};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Room { room_id: u64 },
    PlayerState { room_id: u64, player: Pubkey },
    PlayerRoundChoice { room_id: u64, player: Pubkey },
}

#[derive(Accounts)]
pub struct CreatePermission<'info> {
    /// CHECK: Validated via permission program CPI
    pub permissioned_account: UncheckedAccount<'info>,

    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PERMISSION PROGRAM
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreatePermission<'info> {
    pub fn handler(&self, account_type: AccountType, members: Option<Vec<Member>>) -> Result<()> {
        let seed_data = derive_seeds_from_account_type(&account_type);

        let (_, bump) = Pubkey::find_program_address(
            &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
            &crate::ID,
        );

        let mut seeds = seed_data;
        seeds.push(vec![bump]);
        let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();

        CreatePermissionCpiBuilder::new(&self.permission_program.to_account_info())
            .permissioned_account(&self.permissioned_account.to_account_info())
            .permission(&self.permission.to_account_info())
            .payer(&self.payer.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .args(MembersArgs { members })
            .invoke_signed(&[seed_refs.as_slice()])?;
        Ok(())
    }
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::Room { room_id } => {
            vec![ROOM_SEED.to_vec(), room_id.to_le_bytes().to_vec()]
        }
        AccountType::PlayerState { room_id, player } => {
            vec![
                PLAYER_STATE_SEED.to_vec(),
                room_id.to_le_bytes().to_vec(),
                player.to_bytes().to_vec(),
            ]
        }
        AccountType::PlayerRoundChoice { room_id, player } => {
            vec![
                PLAYER_ROUND_CHOICE_SEED.to_vec(),
                room_id.to_le_bytes().to_vec(),
                player.to_bytes().to_vec(),
            ]
        }
    }
}
