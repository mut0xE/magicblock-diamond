# Instructions

## 1. `initialize_config`

Admin-only. Sets up the global Config account with treasury address and fee percentage. Validates that the caller is the program's upgrade authority.

**Args:** `treasury: Pubkey`, `fee_bps: u8`

**Constraints:**
- Caller must be program upgrade authority
- `fee_bps` <= 100 (1%)

## 2. `create_room`

Creates a new game room. The creator specifies entry fee, max players, and a unique room ID. Also creates a vault PDA to hold entry fees.

**Args:** `room_id: u64`, `entry_fee: u64`, `max_players: u8`

**Constraints:**
- `entry_fee` >= 0.01 SOL (10,000,000 lamports)
- `max_players` between 2 and 5

## 3. `join_room`

Player joins a room by transferring the entry fee to the vault. Creates a PlayerState (0 minus points, Active) and a PlayerRoundChoice account.

**Args:** `room_id: u64`

**Constraints:**
- Room must be in `Waiting` status
- Room not full
- Player hasn't already joined

## 4. `start_match`

Transitions room from `Waiting` to `Active`. Sets current_round to 1 and initializes commit/reveal deadlines.

**Args:** `room_id: u64`

**Constraints:**
- Room must be in `Waiting` status
- At least 2 players joined

## 5. `submit_pick`

Player submits their number for the current round.

**Args:** `room_id: u64`, `round: u8`, `pick: u8`

**Constraints:**
- Room is `Active`
- Player is `Active`
- `pick` between 0 and 100
- `round` matches current round
- Within commit deadline
- Player hasn't already committed this round

## 6. `finalize_round`

Calculates round results. Loads all player states and choices from `remaining_accounts`. Computes target, applies progressive rules, assigns penalties, and advances or ends the game.

**Args:** `room_id: u64`

**Constraints:**
- Room is `Active`
- Reveal deadline has passed
- All active player accounts provided in remaining_accounts

## 7. `settle_match`

Distributes the prize pool. Deducts protocol fee (`prize_pool * fee_bps / 10000`) to treasury. Remainder goes to the winner.

**Args:** `room_id: u64`

**Constraints:**
- Room is `Finished`
- Winner is set
- Not already settled
- Must be on L1 (after undelegate)

## 8. `cancel_room`

Cancels a waiting room, enabling refunds.

**Args:** `room_id: u64`

**Constraints:**
- Room is in `Waiting` status
- Caller is creator, OR room wait timeout (10 min) has elapsed

## 9. `claim_refund`

Returns entry fee to a player from a cancelled room.

**Args:** `room_id: u64`

**Constraints:**
- Room is `Cancelled`
- Player has a valid PlayerState

## 10. `close_player_accounts`

Reclaims rent from PlayerState and PlayerRoundChoice PDAs.

**Args:** `room_id: u64`

**Constraints:**
- Room is in terminal state (`Finished` or `Cancelled`)

## 11. `delegate_input`

Delegates a PDA to MagicBlock's Ephemeral Rollups.

**Args:** `input: DelegateTarget` (enum: `Room`, `PlayerState`, `PlayerChoice`)

## 12. `undelegate`

Commits ER state back to L1 and releases delegation in a single operation using `MagicIntentBundleBuilder::commit_and_undelegate`.

**Args:** `room_id: u64`

**Constraints:**
- Room is `Finished`
- Additional accounts to undelegate passed via remaining_accounts
