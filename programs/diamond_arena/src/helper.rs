use std::collections::HashMap;

use anchor_lang::prelude::*;

use crate::{
    constants::{
        COMMIT_DURATION, ELIMINATION_THRESHOLD, NEW_RULE_COMMIT_DURATION, REVEAL_DURATION,
    },
    error::DiamondError,
    state::{PlayerState, PlayerStatus, Room, RoomStatus},
};

#[derive(Clone)]
pub struct RoundEntry {
    pub player: Pubkey,
    pub pick: u8,
    pub commit_ts: i64,
    pub distance: u64,
    /// Rule 1: if true, this entry's pick was a collision and is excluded from scoring
    pub invalidated: bool,
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
    // Tiebreaker: earlier commit wins
    if a.commit_ts != b.commit_ts {
        return a.commit_ts < b.commit_ts;
    }

    false
}

// ─── Rule 3: Zero-Hundred Override ───────────────────────────────────────────
// If someone picks 0 AND someone picks 100, the 0-picker auto-wins the round.
// Returns Some(player) if rule triggers, None otherwise.
pub fn check_zero_hundred_rule(entries: &[RoundEntry]) -> Option<Pubkey> {
    let zero_player = entries.iter().find(|e| e.pick == 0 && !e.invalidated);
    let has_hundred = entries.iter().any(|e| e.pick == 100 && !e.invalidated);

    if let (Some(zero), true) = (zero_player, has_hundred) {
        msg!(
            "Rule 3 triggered! Player {} picked 0 while another picked 100 -> auto-win",
            zero.player
        );
        Some(zero.player)
    } else {
        None
    }
}

// ─── Rule 1: Collision Invalidation ──────────────────────────────────────────
// After 1st elimination, duplicate picks are INVALIDATED (excluded from scoring).
// Players with invalidated picks get -1 penalty and cannot win the round.
pub fn apply_collision_invalidation(entries: &mut [RoundEntry]) -> Vec<u8> {
    let mut pick_counts: HashMap<u8, usize> = HashMap::new();
    for entry in entries.iter() {
        *pick_counts.entry(entry.pick).or_insert(0) += 1;
    }

    let collision_picks: Vec<u8> = pick_counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(pick, _)| pick)
        .collect();

    // Mark colliding entries as invalidated
    for entry in entries.iter_mut() {
        if collision_picks.contains(&entry.pick) {
            entry.invalidated = true;
            msg!(
                "Rule 1: Player {} pick {} invalidated (collision)",
                entry.player,
                entry.pick
            );
        }
    }

    collision_picks
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
// target = average_of_valid_picks * 0.8
// Only non-invalidated entries are included in the average calculation.
// Invalidated entries get distance = u64::MAX (worst possible).
pub fn score_entries(entries: &mut [RoundEntry]) -> Result<()> {
    let valid_entries: Vec<&RoundEntry> = entries.iter().filter(|e| !e.invalidated).collect();
    let count = valid_entries.len() as u64;

    if count == 0 {
        // All picks were invalidated - everyone gets max distance
        for entry in entries.iter_mut() {
            entry.distance = u64::MAX;
        }
        return Ok(());
    }

    // 1. Sum of valid picks only
    let mut sum: u64 = 0;
    for entry in valid_entries.iter() {
        sum = sum
            .checked_add(entry.pick as u64)
            .ok_or(DiamondError::MathOverflow)?;
    }
    msg!("Sum of valid picks: {} (count: {})", sum, count);

    // 2. Compute distance for each entry
    // target = (sum / count) * 0.8
    // To avoid floating point: pick_scaled = pick * count * 5, target_scaled = sum * 4
    for entry in entries.iter_mut() {
        if entry.invalidated {
            entry.distance = u64::MAX;
            continue;
        }

        let pick_scaled = (entry.pick as u64)
            .checked_mul(count)
            .ok_or(DiamondError::MathOverflow)?
            .checked_mul(5)
            .ok_or(DiamondError::MathOverflow)?;

        let target_scaled = sum.checked_mul(4).ok_or(DiamondError::MathOverflow)?;

        entry.distance = abs_diff_u64(pick_scaled, target_scaled);
        msg!(
            "Player {} -> pick: {}, pick_scaled: {}, target_scaled: {}, distance: {}",
            entry.player,
            entry.pick,
            pick_scaled,
            target_scaled,
            entry.distance
        );
    }

    Ok(())
}

// ─── Rule 2: Exact Match Penalty ─────────────────────────────────────────────
// After 2nd elimination, if a player's pick is exactly the target value,
// they get -2 penalty instead of winning.
// Returns the list of players who hit the exact target.
pub fn find_exact_match_players(entries: &[RoundEntry]) -> Vec<Pubkey> {
    entries
        .iter()
        .filter(|e| !e.invalidated && e.distance == 0)
        .map(|e| e.player)
        .collect()
}

pub fn pick_round_winner(entries: &[RoundEntry]) -> Result<Option<Pubkey>> {
    // Only consider non-invalidated entries
    let valid: Vec<&RoundEntry> = entries.iter().filter(|e| !e.invalidated).collect();

    if valid.is_empty() {
        // All picks invalidated - no winner this round
        return Ok(None);
    }

    let first = valid[0];
    let mut winner = first;

    for entry in valid.iter().skip(1) {
        if is_better_entry(entry, winner) {
            winner = entry;
        }
    }

    Ok(Some(winner.player))
}

/// Main round resolution function implementing all King of Diamonds rules.
pub fn apply_round_result<'info>(
    room: &mut Account<'info, Room>,
    active_players: &mut [Account<'info, PlayerState>],
    winner: Option<Pubkey>,
    exact_match_players: &[Pubkey],
    entries: &[RoundEntry],
) -> Result<()> {
    let rule2 = room.rule2_active();

    for player_state in active_players.iter_mut() {
        if player_state.status != PlayerStatus::Active {
            continue;
        }

        let entry = entries
            .iter()
            .find(|e| e.player == player_state.player)
            .ok_or(DiamondError::PlayerNotFound)?;

        let is_winner = winner.map_or(false, |w| w == player_state.player);
        let is_exact_match = exact_match_players.contains(&player_state.player);

        if entry.invalidated {
            // Rule 1: Invalidated pick -> -1 penalty (cannot win)
            player_state.minus_points = player_state.minus_points.saturating_sub(1);
            msg!(
                "Player {} pick invalidated (collision) -> -1 (now {})",
                player_state.player,
                player_state.minus_points
            );
        } else if rule2 && is_exact_match {
            // Rule 2: Exact match on target -> -2 penalty (cursed precision)
            player_state.minus_points = player_state.minus_points.saturating_sub(2);
            msg!(
                "Rule 2: Player {} hit exact target -> -2 (now {})",
                player_state.player,
                player_state.minus_points
            );
        } else if is_winner {
            // Winner: no penalty
            msg!("Player {} wins this round!", player_state.player);
        } else {
            // Normal loser: -1 minus point
            player_state.minus_points = player_state.minus_points.saturating_sub(1);
            msg!(
                "Player {} loses -> -1 (now {})",
                player_state.player,
                player_state.minus_points
            );
        }

        // Check elimination at threshold
        if player_state.minus_points <= ELIMINATION_THRESHOLD
            && player_state.status == PlayerStatus::Active
        {
            player_state.status = PlayerStatus::Eliminated;
            room.active_players = room.active_players.saturating_sub(1);
            room.eliminations = room.eliminations.saturating_add(1);
            msg!(
                "Player {} ELIMINATED (minus_points: {}, total eliminations: {})",
                player_state.player,
                player_state.minus_points,
                room.eliminations
            );
        }
    }

    Ok(())
}

pub fn resolve_after_round<'info>(
    room: &mut Account<'info, Room>,
    active_players: &mut [Account<'info, PlayerState>],
    eliminations_before: u8,
) -> Result<()> {
    let survivor_count = room.active_players;
    msg!(
        "Round {} complete. Active players: {}, Eliminations: {}",
        room.current_round,
        survivor_count,
        room.eliminations
    );

    match survivor_count {
        0 => {
            room.status = RoomStatus::Finished;
            room.winner = None;
        }
        1 => {
            // Find the sole survivor
            let winner_state = active_players
                .iter_mut()
                .find(|p| p.status == PlayerStatus::Active)
                .ok_or(DiamondError::PlayerNotFound)?;

            winner_state.status = PlayerStatus::Winner;
            room.winner = Some(winner_state.player);
            room.status = RoomStatus::Finished;
        }
        _ => {
            // Determine if a new rule was just unlocked this round
            let new_rule_unlocked = did_new_rule_unlock(eliminations_before, room.eliminations);
            advance_round(room, new_rule_unlocked)?;
        }
    }

    // Persist all player states and room exactly once
    for player_state in active_players.iter_mut() {
        player_state.exit(&crate::ID)?;
    }
    room.exit(&crate::ID)?;
    Ok(())
}

/// Check if a new progressive rule was unlocked during this round.
/// Rules unlock at elimination thresholds: 1, 2, 3.
fn did_new_rule_unlock(before: u8, after: u8) -> bool {
    // A new rule unlocks if we crossed a threshold (1, 2, or 3)
    for threshold in [1u8, 2, 3] {
        if before < threshold && after >= threshold {
            return true;
        }
    }
    false
}

fn advance_round(room: &mut Room, new_rule_unlocked: bool) -> Result<()> {
    room.current_round = room
        .current_round
        .checked_add(1)
        .ok_or(DiamondError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;

    // If a new rule was just introduced, give players more time to adjust
    let commit_duration = if new_rule_unlocked {
        msg!(
            "New rule unlocked! Extended commit duration: {}s",
            NEW_RULE_COMMIT_DURATION
        );
        NEW_RULE_COMMIT_DURATION
    } else {
        COMMIT_DURATION
    };

    room.commit_deadline = now + commit_duration;
    room.reveal_deadline = now + commit_duration + REVEAL_DURATION;
    Ok(())
}
