// PDA seeds
pub const ROOM_SEED: &[u8] = b"room";
pub const PLAYER_STATE_SEED: &[u8] = b"player_state";
pub const PLAYER_ROUND_CHOICE_SEED: &[u8] = b"player_round_choice";
pub const VAULT_SEED: &[u8] = b"vault";
pub const CONFIG_SEED: &[u8] = b"config";

// Minus points system: start at 0, eliminated at -10
pub const ELIMINATION_THRESHOLD: i8 = -10;
pub const DEFAULT_MINUS_POINTS: i8 = 0;

// Player limits
pub const MIN_PLAYERS: u8 = 2;
pub const MAX_PLAYERS: u8 = 5;

// Pick range: 0 to 100
pub const MAX_NUMBER: u8 = 100;

// Account discriminator
pub const DISCRIMINATOR: usize = 8;

// Round timing (tuned for ER where clock tracks real time)
// Commit phase: time for players to submit their pick
// Reveal phase: buffer before finalization can happen
// For production (non-ER), increase these to 60/120/5 respectively
pub const COMMIT_DURATION: i64 = 5;
pub const NEW_RULE_COMMIT_DURATION: i64 = 8;
pub const REVEAL_DURATION: i64 = 2;

// Room timeout: if room is still Waiting after 10 minutes, any player can cancel
pub const ROOM_WAIT_TIMEOUT: i64 = 600;
// Active game timeout: if reveal_deadline passed by 5 minutes and nobody finalized
pub const ROUND_ABANDON_TIMEOUT: i64 = 300;

// Minimum entry fee: 0.01 SOL
pub const MIN_ENTRY_FEE: u64 = 10_000_000;

// Maximum fee basis points (1% = 100 bps)
pub const MAX_FEE_BPS: u8 = 100;
