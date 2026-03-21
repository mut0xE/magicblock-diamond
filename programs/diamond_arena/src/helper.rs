use std::collections::HashMap;

use anchor_lang::prelude::*;

use crate::{
    constants::{COMMIT_DURATION, REVEAL_DURATION},
    error::DiamondError,
    state::{PlayerState, PlayerStatus, Room, RoomStatus},
};

#[derive(Clone)]
pub struct RoundEntry {
    pub player: Pubkey,
    pub pick: u8,
    pub commit_ts: i64,
    pub distance: u64,
}

pub fn abs_diff_u64(a: u64, b: u64) -> u64 {
    if a >= b {
        a - b
    } else {
        b - a
    }
}

pub fn is_better_entry(a: &RoundEntry, b: &RoundEntry) -> bool {
    if a.distance != b.distance {
        return a.distance < b.distance;
    }

    if a.commit_ts != b.commit_ts {
        return a.commit_ts < b.commit_ts;
    }

    false
}

// Now compute distance from target
// target = (sum / count) * 0.8
pub fn score_entries(entries: &mut [RoundEntry]) -> Result<()> {
    let count = entries.len() as u64;
    require!(count > 0, DiamondError::NoPlayersInRound);

    // 1. calculate sum of all picks
    let mut sum: u64 = 0;
    for entry in entries.iter() {
        sum = sum
            .checked_add(entry.pick as u64)
            .ok_or(DiamondError::MathOverflow)?;
    }
    msg!("Sum of picks: {}", sum);
    // 2. compute distance for each player
    for entry in entries.iter_mut() {
        let pick_scaled = (entry.pick as u64)
            .checked_mul(count)
            .ok_or(DiamondError::MathOverflow)?
            .checked_mul(5)
            .ok_or(DiamondError::MathOverflow)?;

        let target_scaled = sum.checked_mul(4).ok_or(DiamondError::MathOverflow)?;
        msg!("Target scaled (sum * 4): {}", target_scaled);

        entry.distance = abs_diff_u64(pick_scaled, target_scaled);
        msg!(
            "Player {} -> pick: {}, pick_scaled: {}, distance: {}",
            entry.player,
            entry.pick,
            pick_scaled,
            entry.distance
        );
    }

    Ok(())
}

pub fn pick_round_winner(entries: &[RoundEntry]) -> Result<Pubkey> {
    let first = entries.first().ok_or(DiamondError::NoPlayersInRound)?;
    // Assume first player is winner
    let mut winner = first;

    for entry in entries.iter().skip(1) {
        if is_better_entry(entry, winner) {
            winner = entry;
        }
    }

    Ok(winner.player)
}

pub fn apply_round_result<'info>(
    active_players: &mut [Account<'info, PlayerState>],
    winner: Pubkey,
    collision_picks: &[u8],
    entries: &[RoundEntry],
) -> Result<()> {
    for player_state in active_players.iter_mut() {
        let entry = entries
            .iter()
            .find(|e| e.player == player_state.player)
            .ok_or(DiamondError::PlayerNotFound)?;

        let is_winner = player_state.player == winner;
        let is_collision = collision_picks.contains(&entry.pick);

        if is_winner {
            msg!("Player {} wins this round!", player_state.player);
        } else if is_collision {
            // Collision penalty: -2 lives!
            player_state.lives = player_state.lives.saturating_sub(2).max(0);
            msg!(
                "Player {} collided (pick {})! Loses 2 lives",
                player_state.player,
                entry.pick
            );
        } else {
            // Normal loss: -1 life
            player_state.lives = player_state.lives.saturating_sub(1).max(0);
            msg!("Player {} loses 1 life", player_state.player);
        }
        // Check elimination
        if player_state.lives == 0 && player_state.status == PlayerStatus::Active {
            player_state.status = PlayerStatus::Eliminated;
            msg!("Player {} eliminated!", player_state.player);
        }
    }
    for player_state in active_players.iter_mut() {
        player_state.exit(&crate::ID)?;
    }
    Ok(())
}

pub fn resolve_after_round<'info>(
    room: &mut Account<'info, Room>,
    active_players: &mut [Account<'info, PlayerState>],
) -> Result<()> {
    // collect survivors
    let survivors: Vec<Pubkey> = active_players
        .iter()
        .filter(|p| p.status == PlayerStatus::Active)
        .map(|p| p.player)
        .collect();
    msg!("Round count: {}", room.current_round);

    match survivors.len() {
        0 => {
            room.status = RoomStatus::Finished;
            room.winner = None
        }
        1 => {
            let winner = survivors[0];
            let winner_state = active_players
                .iter_mut()
                .find(|p| p.player == winner)
                .ok_or(DiamondError::PlayerNotFound)?;

            winner_state.status = PlayerStatus::Winner;
            room.winner = Some(winner);
            room.status = RoomStatus::Finished;
            // Persist the winner
            winner_state.exit(&crate::ID)?;
        }
        _ => {
            // continue game -> next round
            advance_round(room)?;
        }
    }
    room.exit(&crate::ID)?;
    Ok(())
}

fn advance_round<'info>(room: &mut Account<'info, Room>) -> Result<()> {
    room.current_round = room
        .current_round
        .checked_add(1)
        .ok_or(DiamondError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    // set fresh deadlines for the next round
    room.commit_deadline = now + COMMIT_DURATION;
    room.reveal_deadline = now + COMMIT_DURATION + REVEAL_DURATION;
    room.exit(&crate::ID)?;
    Ok(())
}

/// Find which picks were chosen by multiple players (collision = -2 penalty)
pub fn find_collisions(entries: &[RoundEntry]) -> Vec<u8> {
    let mut pick_counts: HashMap<u8, usize> = HashMap::new();

    for entry in entries {
        *pick_counts.entry(entry.pick).or_insert(0) += 1;
    }

    // Return picks that appear more than once
    pick_counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(pick, _)| pick)
        .collect()
}
