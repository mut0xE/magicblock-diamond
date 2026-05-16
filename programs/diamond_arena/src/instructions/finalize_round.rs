use crate::{
    constants::{MAX_NUMBER, PLAYER_ROUND_CHOICE_SEED, PLAYER_STATE_SEED, ROOM_SEED},
    error::DiamondError,
    events,
    helper::{
        apply_collision_invalidation, apply_round_result, check_zero_hundred_rule,
        find_exact_match_players, pick_round_winner, resolve_after_round, score_entries,
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
        let program_id = &crate::ID;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp > room.reveal_deadline,
            DiamondError::RevealPhaseNotOver
        );

        // Load all ACTIVE players from remaining_accounts with PDA validation
        let mut active_players =
            load_active_player_states(remaining_accounts, room_key, program_id)?;

        let player_count = active_players.len();
        // Need at least 2 players to run a round
        require!(player_count >= 2, DiamondError::NotEnoughActivePlayers);

        // Load all ROUND CHOICES for this round with PDA validation
        let mut round_choices =
            load_round_choices(remaining_accounts, room_key, current_round, program_id)?;

        // Snapshot eliminations before this round (for detecting new rule unlocks)
        let eliminations_before = room.eliminations;

        // Build entries (player + their pick)
        let mut entries = build_round_entries(&active_players, &round_choices, current_round)?;

        // ── Rule 3 check (after 3rd elimination): 0 vs 100 override ──
        // Must check BEFORE collision invalidation since 0 or 100 could collide
        let rule3_winner = if room.rule3_active() {
            check_zero_hundred_rule(&entries)
        } else {
            None
        };

        // ── Rule 1 (after 1st elimination): Collision invalidation ──
        // Duplicate picks are invalidated and excluded from scoring
        if room.rule1_active() {
            apply_collision_invalidation(&mut entries);
        }

        // Determine the winner
        let winner = if let Some(r3_winner) = rule3_winner {
            // Rule 3 override: 0-picker auto-wins
            msg!("Rule 3 override: {} wins via 0-vs-100", r3_winner);
            Some(r3_winner)
        } else {
            // Normal scoring: calculate target + distances
            score_entries(&mut entries)?;

            // ── Rule 2 (after 2nd elimination): Exact match detection ──
            let exact_match_players = if room.rule2_active() {
                find_exact_match_players(&entries)
            } else {
                vec![]
            };

            // Pick winner (closest to target, excluding invalidated & exact matches)
            let mut candidate_winner = pick_round_winner(&entries)?;

            // If the "winner" is an exact match player under Rule 2, they don't win
            if let Some(w) = candidate_winner {
                if exact_match_players.contains(&w) {
                    msg!(
                        "Rule 2: Winner {} hit exact target, penalty instead of win",
                        w
                    );
                    candidate_winner = None;
                }
            }

            // Apply round results (penalties/rewards)
            apply_round_result(
                room,
                &mut active_players,
                candidate_winner,
                &exact_match_players,
                &entries,
            )?;

            candidate_winner
        };

        // If Rule 3 triggered, we still need to apply penalties for non-winners
        if rule3_winner.is_some() {
            apply_round_result(
                room,
                &mut active_players,
                winner,
                &vec![], // no exact match penalty during Rule 3 override
                &entries,
            )?;
        }

        // Reset choices for next round and persist them
        for choice in round_choices.iter_mut() {
            choice.pick = None;
            choice.committed = false;
            choice.timestamp = 0;
            choice.exit(&crate::ID)?;
        }

        // Check if game ends or continue (with new rule detection)
        resolve_after_round(room, &mut active_players, eliminations_before)?;

        // Emit round finalized event
        let eliminations_this_round = room.eliminations.saturating_sub(eliminations_before);
        emit!(events::RoundFinalized {
            room_id: room_key,
            round: current_round,
            winner,
            eliminations_this_round,
            total_eliminations: room.eliminations,
            active_players: room.active_players,
            rule1_active: room.rule1_active(),
            rule2_active: room.rule2_active(),
            rule3_active: room.rule3_active(),
        });

        // Emit match finished event if game ended
        if room.status == RoomStatus::Finished {
            emit!(events::MatchFinished {
                room_id: room_key,
                winner: room.winner,
                total_rounds: room.current_round,
            });
        }

        Ok(())
    }
}

/// Validate that an account info matches the expected PDA derived from seeds
fn validate_pda(account_info: &AccountInfo, seeds: &[&[u8]], program_id: &Pubkey) -> Result<()> {
    let (expected_pda, _bump) = Pubkey::find_program_address(seeds, program_id);
    require!(
        account_info.key() == expected_pda,
        DiamondError::InvalidPlayerStatePda
    );
    Ok(())
}

fn load_active_player_states<'info>(
    remaining_accounts: &'info [AccountInfo<'info>],
    room_key: u64,
    program_id: &Pubkey,
) -> Result<Vec<Account<'info, PlayerState>>> {
    let mut players = Vec::new();
    let room_id_bytes = room_key.to_le_bytes();

    for account_info in remaining_accounts.iter() {
        if let Ok(player_state) = Account::<PlayerState>::try_from(account_info) {
            if player_state.room_id == room_key && player_state.status == PlayerStatus::Active {
                // Validate PDA derivation
                validate_pda(
                    account_info,
                    &[
                        PLAYER_STATE_SEED,
                        &room_id_bytes,
                        player_state.player.as_ref(),
                    ],
                    program_id,
                )?;
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
    program_id: &Pubkey,
) -> Result<Vec<Account<'info, PlayerRoundChoice>>> {
    let mut choices = Vec::new();
    let room_id_bytes = room_key.to_le_bytes();

    for account_info in remaining_accounts.iter() {
        if let Ok(choice) = Account::<PlayerRoundChoice>::try_from(account_info) {
            if choice.room_id == room_key && choice.round == round {
                // Validate PDA derivation
                validate_pda(
                    account_info,
                    &[
                        PLAYER_ROUND_CHOICE_SEED,
                        &room_id_bytes,
                        choice.player.as_ref(),
                    ],
                    program_id,
                )?;
                choices.push(choice);
            }
        }
    }

    Ok(choices)
}

fn build_round_entries<'info>(
    active_players: &[Account<'info, PlayerState>],
    round_choices: &[Account<'info, PlayerRoundChoice>],
    current_round: u8,
) -> Result<Vec<RoundEntry>> {
    let mut entries = Vec::with_capacity(active_players.len());
    for player_state in active_players.iter() {
        // Find this player's choice for this round
        let choice = round_choices
            .iter()
            .find(|c| c.player == player_state.player);

        let (pick, commit_ts) = match choice {
            Some(c) if c.committed && c.round == current_round => {
                // Player submitted a valid pick
                let p = c.pick.unwrap_or(MAX_NUMBER);
                (p.min(MAX_NUMBER), c.timestamp)
            }
            _ => {
                // Player did NOT submit a pick this round.
                // Default: pick = MAX_NUMBER (100), worst possible position.
                // This ensures the game doesn't get stuck.
                msg!(
                    "Player {} did not submit pick, defaulting to {}",
                    player_state.player,
                    MAX_NUMBER
                );
                (MAX_NUMBER, i64::MAX) // MAX timestamp = worst tiebreaker
            }
        };

        entries.push(RoundEntry {
            player: player_state.player,
            pick,
            commit_ts,
            distance: 0,
            invalidated: false,
        });
    }

    Ok(entries)
}
