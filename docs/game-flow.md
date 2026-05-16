# Game Flow

## Full Lifecycle

```mermaid
sequenceDiagram
    participant Creator
    participant Players
    participant L1 as Solana L1
    participant ER as MagicBlock ER

    Creator->>L1: create_room(entry_fee, max_players)
    Players->>L1: join_room() [pay entry fee]
    Note over L1: Vault accumulates prize pool

    Creator->>L1: delegate(room + player PDAs)
    Note over L1,ER: Ownership transfers to ER

    Creator->>ER: start_match()
    Note over ER: Round 1 begins

    loop Each Round
        Players->>ER: submit_pick(0-100)
        Note over ER: Wait for commit + reveal deadlines
        Creator->>ER: finalize_round()
        Note over ER: Score picks, apply rules,<br/>eliminate players at -10
    end

    Note over ER: 1 player remaining = Winner

    Creator->>ER: undelegate() [commit_and_undelegate]
    Note over L1,ER: State returns to L1

    Creator->>L1: settle_match()
    Note over L1: Prize to winner, fee to treasury
```

## Instruction Flow

```mermaid
graph TD
    subgraph "Setup"
        IC[initialize_config]
        CR[create_room]
        JR[join_room]
    end

    subgraph "ER Delegation"
        DI[delegate_input]
    end

    subgraph "Game Loop on ER"
        SM[start_match]
        SP[submit_pick]
        FR[finalize_round]
    end

    subgraph "Settlement"
        UD[undelegate]
        SE[settle_match]
    end

    subgraph "Cancellation"
        CA[cancel_room]
        RF[claim_refund]
        CL[close_player_accounts]
    end

    IC --> CR --> JR --> DI --> SM
    SM --> SP --> FR
    FR -->|2+ alive| SP
    FR -->|1 alive| UD --> SE
    CR -->|timeout| CA --> RF --> CL
```

## Round Timing

Each round has two phases:

1. **Commit phase** — Players submit their picks (5 seconds, or 8 seconds if a new rule just unlocked)
2. **Reveal buffer** — Short wait before finalization is allowed (2 seconds)

After the reveal deadline passes, anyone can call `finalize_round` to resolve the round.

## Cancellation Flow

- Creator can cancel a room at any time while it's in `Waiting` status
- Any player can cancel after the room wait timeout (10 minutes)
- After cancellation, each player calls `claim_refund` to get their entry fee back
- `close_player_accounts` reclaims rent from PDAs once the room is in a terminal state
