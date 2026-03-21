// use anchor_lang::prelude::*;
// use ephemeral_rollups_sdk::access_control::instructions::CreatePermission;
// /// Creates a permission based on account type input.
// /// Derives the bump from the account type and seeds, then calls the permission program.
// pub fn create_permission(
//     ctx: Context<CreatePermission>,
//     account_type: AccountType,
//     members: Option<Vec<Member>>,
// ) -> Result<()> {
//     let CreatePermission {
//         permissioned_account,
//         permission,
//         payer,
//         permission_program,
//         system_program,
//     } = ctx.accounts;

//     let seed_data = derive_seeds_from_account_type(&account_type);

//     let (_, bump) = Pubkey::find_program_address(
//         &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
//         &crate::ID,
//     );

//     let mut seeds = seed_data.clone();
//     seeds.push(vec![bump]);
//     let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();

//     CreatePermissionCpiBuilder::new(&permission_program)
//         .permissioned_account(&permissioned_account.to_account_info())
//         .permission(&permission)
//         .payer(&payer)
//         .system_program(&system_program)
//         .args(MembersArgs { members })
//         .invoke_signed(&[seed_refs.as_slice()])?;
//     Ok(())
// }
