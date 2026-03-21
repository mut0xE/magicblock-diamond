use crate::{
    constants::{MAX_NUMBER, ROOM_SEED},
    error::DiamondError,
    helper::{
        apply_round_result, find_collisions, pick_round_winner, resolve_after_round, score_entries,
        RoundEntry,
    },
    state::{PlayerRoundChoice, PlayerState, PlayerStatus, Room, RoomStatus},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct FinalizeRound<'info> {
    #[account(mut)]
    pub finalizer: Signer<'info>,

    #[account(
            mut,
            seeds = [ROOM_SEED, &room_id.to_le_bytes()],
            bump = room.bump,
            constraint = room.status == RoomStatus::Active @ DiamondError::RoomNotActive,
        )]
    pub room: Account<'info, Room>,
}

impl<'info> FinalizeRound<'info> {
    pub fn handler(
        &mut self,
        _room_id: u64,
        remaining_accounts: &'info [AccountInfo<'info>],
    ) -> Result<()> {
        let room = &mut self.room;
        let current_round = room.current_round;
        let room_key = room.room_id;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp > room.reveal_deadline,
            DiamondError::RevealPhaseNotOver
        );

        //  Load all ACTIVE players from remaining_accounts
        let mut active_players = load_active_player_states(remaining_accounts, room_key)?;

        // Need at least 2 players to run a round
        require!(
            active_players.len() >= 2,
            DiamondError::NotEnoughActivePlayers
        );

        // Load all ROUND CHOICES for this round
        let mut round_choices = load_round_choices(remaining_accounts, room_key, current_round)?;
        // Build entries (player + their pick)
        let mut entries = build_round_entries(&active_players, &round_choices)?;

        //  Collision penalty (same pick = extra damage)
        let collision_picks = find_collisions(&entries);

        // Calculate target + distances
        score_entries(&mut entries)?;

        //  PICK: Winner (closest to target)
        let winner = pick_round_winner(&entries)?;

        // Round result with collision penalty
        apply_round_result(&mut active_players, winner, &collision_picks, &entries)?;

        for choice in round_choices.iter_mut() {
            choice.revealed = true;
        }
        // Check if game ends or continue
        resolve_after_round(room, &mut active_players)?;

        Ok(())
    }
}
fn load_active_player_states<'info>(
    remaining_accounts: &'info [AccountInfo<'info>],
    room_key: u64,
) -> Result<Vec<Account<'info, PlayerState>>> {
    let mut players = Vec::new();
    // Try to parse account as PlayerState
    for account_info in remaining_accounts.iter() {
        if let Ok(player_state) = Account::<PlayerState>::try_from(account_info) {
            // Only keep players from this room AND still active
            if player_state.room_id == room_key && player_state.status == PlayerStatus::Active {
                players.push(player_state);
            }
        }
    }

    Ok(players)
}

fn load_round_choices<'info>(
    remaining_accounts: &'info [AccountInfo<'info>],
    room_key: u64,
    round: u8,
) -> Result<Vec<Account<'info, PlayerRoundChoice>>> {
    let mut choices = Vec::new();

    // Try to parse account as PlayerRoundChoice
    for account_info in remaining_accounts.iter() {
        if let Ok(choice) = Account::<PlayerRoundChoice>::try_from(account_info) {
            // Only keep choices from this room AND this round
            if choice.room_id == room_key && choice.round == round {
                choices.push(choice);
            }
        }
    }

    Ok(choices)
}

fn build_round_entries<'info>(
    active_players: &[Account<'info, PlayerState>],
    round_choices: &[Account<'info, PlayerRoundChoice>],
) -> Result<Vec<RoundEntry>> {
    let mut entries = Vec::with_capacity(active_players.len());
    for player_state in active_players.iter() {
        // Find this player's choice
        let choice = round_choices
            .iter()
            .find(|c| c.player == player_state.player)
            .ok_or(DiamondError::MissingRoundChoice)?;

        // Ensure player committed
        require!(choice.committed, DiamondError::PlayerNotCommitted);

        // Extract the actual pick (0–100)
        let pick = choice.pick.unwrap_or(MAX_NUMBER);
        require!(pick <= MAX_NUMBER, DiamondError::InvalidPick);

        // Create scoring entry
        entries.push(RoundEntry {
            player: player_state.player,
            pick,
            commit_ts: choice.timestamp,
            distance: 0,
        });
    }

    Ok(entries)
}
