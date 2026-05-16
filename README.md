# Diamond Arena

A competitive elimination game on Solana built with **Anchor** and **MagicBlock Ephemeral Rollups**. Players enter rooms, pay entry fees, and compete in a battle-royale number-picking game with progressive rules. Last player standing wins the prize pool.

## How It Works

- Players join a room by paying an entry fee (min 0.01 SOL)
- Each round, everyone picks a number between 0 and 100
- The target is computed as **80% of the average** of all valid picks
- Closest to the target wins the round (no penalty)
- Everyone else receives **-1 minus point**
- Players are eliminated at **-10 minus points**
- As eliminations occur, progressive rules activate (collisions, exact match penalty, zero-vs-hundred)
- The last player standing wins the entire prize pool minus protocol fee

Rounds execute on MagicBlock's Ephemeral Rollups for low-latency gameplay, with final state committed back to Solana L1 for trustless settlement.

## Repository Layout

- `programs/diamond_arena/` — Anchor on-chain program (Rust)
- `tests/` — Integration and edge-case test suites (TypeScript)
- `docs/` — Detailed documentation (architecture, game flow, scoring, ER integration)

## Instruction Set

| # | Instruction | Description |
|---|-------------|-------------|
| 1 | `initialize_config` | Admin sets treasury address and protocol fee |
| 2 | `create_room` | Create a game room with entry fee and max players (2–5) |
| 3 | `join_room` | Join a room and pay entry fee to vault |
| 4 | `start_match` | Begin the match (requires >= 2 players) |
| 5 | `submit_pick` | Submit a number 0–100 for the current round |
| 6 | `finalize_round` | Score picks, apply rules, eliminate or advance |
| 7 | `settle_match` | Distribute prize pool to winner |
| 8 | `cancel_room` | Cancel a waiting room (creator or timeout) |
| 9 | `claim_refund` | Refund entry fee from cancelled room |
| 10 | `close_player_accounts` | Reclaim rent from terminal rooms |
| 11 | `delegate_input` | Delegate PDAs to Ephemeral Rollups |
| 12 | `undelegate` | Commit and undelegate back to L1 |

## Prerequisites

- Rust (see `rust-toolchain.toml`)
- Solana CLI
- Anchor CLI 0.32.1
- Node.js + Yarn

## Build

```bash
anchor build
```

## Tests

```bash
# Set player keypair paths
export PLAYER2_KEY_PATH=/path/to/player2.json
export PLAYER3_KEY_PATH=/path/to/player3.json

# Run all tests
anchor test
```

Tests connect to both Solana devnet and the MagicBlock ER devnet endpoint.

## Program ID

```
CMZ49EUStUR9gj2PESATssmMu9hLPaUjhkgn8dmd85jY (devnet)
```
