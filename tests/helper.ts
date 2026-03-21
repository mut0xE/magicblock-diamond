import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { expect } from "chai";
import { DiamondArena } from "../target/types/diamond_arena";
import fs from "fs";
import { DEVNET_ASIA_VALIDATOR } from "./constants";
// Load player from file
export function loadPlayer(filePath: string): anchor.web3.Keypair {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(data));
}

// Make a PDA address
export function getPda(
  seeds: (Buffer | Uint8Array)[],
  program: Program<DiamondArena>
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(seeds, program.programId);
  return pda;
}

export function getRoomId(): anchor.BN {
  return new anchor.BN(randomBytes(8));
}

export const logTransactionResult = (label: string, txSignature: string) => {
  console.log(`\n${label}:`);
  console.log(`   Txn signature: ${txSignature}`);
};

export async function expectAnchorError(
  promise: Promise<any>,
  errorCode: string
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected error "${errorCode}" but transaction succeeded`);
  } catch (err) {
    if (err instanceof anchor.AnchorError) {
      console.log(err.toString());
      expect(err.error.errorCode.code).to.equal(
        errorCode,
        `Expected "${errorCode}" but got "${err.error.errorCode.code}"`
      );
    } else {
      throw err;
    }
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Pdas {
  room: PublicKey;
  vault: PublicKey;
  playerStates: { [key: string]: PublicKey }; // key = player pubkey
  playerChoices: { [key: string]: PublicKey }; // key = "pubkey_round"
}

export function buildAllPdas(
  roomId: BN,
  players: PublicKey[],
  rounds: number[],
  program: Program<DiamondArena>
): Pdas {
  // Room and vault
  const room = getPda(
    [Buffer.from("room"), roomId.toArrayLike(Buffer, "le", 8)],
    program
  );
  const vault = getPda(
    [Buffer.from("vault"), roomId.toArrayLike(Buffer, "le", 8)],
    program
  );

  // Player state for each player
  const playerStates: { [key: string]: PublicKey } = {};
  for (const player of players) {
    const key = player.toBase58();
    playerStates[key] = getPda(
      [
        Buffer.from("player_state"),
        roomId.toArrayLike(Buffer, "le", 8),
        player.toBuffer(),
      ],
      program
    );
  }
  // Player choices for each player and round
  const playerChoices: { [key: string]: PublicKey } = {};
  for (const player of players) {
    for (const round of rounds) {
      const key = `${player.toBase58()}_${round}`;
      playerChoices[key] = getPda(
        [
          Buffer.from("player_round_choice"),
          roomId.toArrayLike(Buffer, "le", 8),
          Buffer.from([round]),
          player.toBuffer(),
        ],
        program
      );
    }
  }

  return { room, vault, playerStates, playerChoices };
}

// Join room
export async function joinRoom(
  program: Program<DiamondArena>,
  player: anchor.web3.Keypair,
  roomId: BN,
  pdas: Pdas
): Promise<string> {
  const playerPubkey = player.publicKey;
  const playerStatePda = pdas.playerStates[playerPubkey.toBase58()];

  const tx = await program.methods
    .joinRoom(roomId)
    .accounts({
      player: playerPubkey,
      //@ts-ignore
      room: pdas.room,
      playerState: playerStatePda,
      vault: pdas.vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([player])
    .rpc();

  return tx;
}

// Submit a pick
export async function submitPick(
  program: Program<DiamondArena>,
  player: anchor.web3.Keypair,
  roomId: BN,
  round: number,
  pick: number,
  pdas: Pdas
): Promise<string> {
  const playerPubkey = player.publicKey;
  const playerStatePda = pdas.playerStates[playerPubkey.toBase58()];
  const choicePda = pdas.playerChoices[`${playerPubkey.toBase58()}_${round}`];

  const tx = await program.methods
    .submitPick(roomId, round, pick)
    .accounts({
      player: playerPubkey,
      //@ts-ignore
      room: pdas.room,
      playerState: playerStatePda,
      playerRoundChoice: choicePda,
      systemProgram: SystemProgram.programId,
    })
    .signers([player])
    .rpc();

  return tx;
}

// Finish a round
export async function finalizeRound(
  program: Program<DiamondArena>,
  admin: anchor.web3.Keypair,
  roomId: BN,
  activePlayers: anchor.web3.Keypair[],
  round: number,
  pdas: Pdas
): Promise<string> {
  // Build remaining accounts list
  const remainingAccounts = [];

  for (const player of activePlayers) {
    const key = player.publicKey.toBase58();
    const playerStatePda = pdas.playerStates[key];
    const choicePda = pdas.playerChoices[`${key}_${round}`];

    remainingAccounts.push({
      pubkey: playerStatePda,
      isWritable: true,
      isSigner: false,
    });
    remainingAccounts.push({
      pubkey: choicePda,
      isWritable: true,
      isSigner: false,
    });
  }

  const tx = await program.methods
    .finalizeRound(roomId)
    .accounts({
      finalizer: admin.publicKey,
      //@ts-ignore
      room: pdas.room,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();

  return tx;
}

export async function delegatePlayerStates(
  program: Program<DiamondArena>,
  payer: anchor.web3.Keypair,
  roomId: anchor.BN,
  player: PublicKey,
  playerStatePda: PublicKey
): Promise<string> {
  const tx = await program.methods
    .delegatePlayerState(roomId, player)
    .accounts({
      payer: payer.publicKey,
      //@ts-ignore
      playerState: playerStatePda,
      validator: DEVNET_ASIA_VALIDATOR,
    })
    .remainingAccounts([
      {
        pubkey: DEVNET_ASIA_VALIDATOR,
        isWritable: false,
        isSigner: false,
      },
    ])
    .signers([payer])
    .rpc();

  return tx;
}

// Check player lives
export async function getPlayerLives(
  program: Program<DiamondArena>,
  playerStatePda: PublicKey
): Promise<number> {
  const state = await program.account.playerState.fetch(playerStatePda);
  return state.lives;
}

// Check player status
export async function getPlayerStatus(
  program: Program<DiamondArena>,
  playerStatePda: PublicKey
): Promise<string> {
  const state = await program.account.playerState.fetch(playerStatePda);
  if (state.status.active) return "active";
  if (state.status.eliminated) return "eliminated";
  if (state.status.winner) return "winner";
  return "unknown";
}

// Print game state
export function printState(
  round: number,
  players: Array<{ name: string; lives: number }>
) {
  console.log("\n================================");
  console.log(`Round ${round}`);
  console.log("================================");
  for (const p of players) {
    console.log(`  ${p.name}: ${p.lives} lives`);
  }
  console.log("================================\n");
}

// Print final results
export function printFinal(
  players: Array<{ name: string; lives: number; status: string }>
) {
  console.log("\n================================");
  console.log("FINAL RESULTS");
  console.log("================================");
  for (const p of players) {
    console.log(`  ${p.name}: ${p.lives} lives [${p.status}]`);
  }
  console.log("================================\n");
}

// Print round results
export function printRound(
  round: number,
  picks: Array<{ name: string; pick: number }>,
  results: Array<{ name: string; lives: number }>
) {
  console.log(`\n--- Round ${round} Results ---`);
  console.log("Picks:");
  for (const p of picks) {
    console.log(`  ${p.name}: ${p.pick}`);
  }
  console.log("Lives after:");
  for (const r of results) {
    console.log(`  ${r.name}: ${r.lives}`);
  }
  console.log("");
}

// ============ FETCH DATA FROM ON-CHAIN ============

export async function getRoomData(
  program: Program<DiamondArena>,
  roomPda: PublicKey
) {
  const roomAccount = await program.account.room.fetch(roomPda);
  return {
    roomId: roomAccount.roomId.toString(),
    currentRound: roomAccount.currentRound,
    currentPlayers: roomAccount.currentPlayers,
    maxPlayers: roomAccount.maxPlayers,
    status: roomAccount.status,
    commitDeadline: roomAccount.commitDeadline.toNumber(),
    revealDeadline: roomAccount.revealDeadline.toNumber(),
    entryFee: roomAccount.entryFee.toNumber(),
    winner: roomAccount.winner?.toBase58() || "None",
  };
}

export async function getPlayerData(
  program: Program<DiamondArena>,
  playerStatePda: PublicKey
) {
  const state = await program.account.playerState.fetch(playerStatePda);
  return {
    player: state.player.toBase58(),
    roomId: state.roomId.toString(),
    lives: state.lives,
    joinedAtRound: state.joinedAtRound,
    status: getStatusName(state.status),
  };
}

export async function getPlayerChoice(
  program: Program<DiamondArena>,
  choicePda: PublicKey
) {
  const choice = await program.account.playerRoundChoice.fetch(choicePda);
  return {
    player: choice.player.toBase58(),
    roomId: choice.roomId.toString(),
    round: choice.round,
    pick: choice.pick,
    committed: choice.committed,
    revealed: choice.revealed,
  };
}

export function getStatusName(status: any): string {
  if (status.active) return "ACTIVE";
  if (status.eliminated) return "ELIMINATED";
  if (status.winner) return "WINNER";
  return "UNKNOWN";
}

export async function displayRoomState(
  program: Program<DiamondArena>,
  roomPda: PublicKey,
  title: string
) {
  const room = await getRoomData(program, roomPda);

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log(`║ ${title}`.padEnd(57) + "║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(
    `║ Room ID:          ${room.roomId.slice(0, 40)}`.padEnd(57) + "║"
  );
  console.log(`║ Current Round:    ${room.currentRound}`.padEnd(57) + "║");
  console.log(
    `║ Players:          ${room.currentPlayers}/${room.maxPlayers}`.padEnd(57) +
      "║"
  );
  console.log(
    `║ Status:           ${JSON.stringify(room.status)}`.padEnd(57) + "║"
  );
  console.log(
    `║ Winner:           ${room.winner.slice(0, 40)}`.padEnd(57) + "║"
  );
  console.log("╚════════════════════════════════════════════════════════╝\n");
}

export async function displayPlayerState(
  program: Program<DiamondArena>,
  playerPda: PublicKey,
  playerName: string
) {
  const player = await getPlayerData(program, playerPda);

  console.log(`\n${playerName}:`);
  console.log(`  Lives:    ${player.lives}`);
  console.log(`  Status:   ${player.status}`);
  console.log(`  Joined:   Round ${player.joinedAtRound}`);
}

export async function displayRoundResults(
  program: Program<DiamondArena>,
  round: number,
  players: Array<{ name: string; keypair: anchor.web3.Keypair }>,
  pdas: Pdas
) {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log(`║ ROUND ${round} DETAILS`.padEnd(57) + "║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log("║ PICKS:".padEnd(57) + "║");

  // Get all picks for this round
  for (const p of players) {
    const choiceKey = `${p.keypair.publicKey.toBase58()}_${round}`;
    const choicePda = pdas.playerChoices[choiceKey];

    if (choicePda) {
      const choice = await getPlayerChoice(program, choicePda);
      console.log(
        `║   ${p.name.padEnd(20)} picked:  ${choice.pick
          .toString()
          .padStart(2)}`.padEnd(57) + "║"
      );
    }
  }

  console.log("╠════════════════════════════════════════════════════════╣");
  console.log("║ PLAYER STATES AFTER ROUND:".padEnd(57) + "║");

  // Show all player states
  for (const p of players) {
    const playerPda = pdas.playerStates[p.keypair.publicKey.toBase58()];
    const player = await getPlayerData(program, playerPda);
    const statusIcon =
      player.status === "WINNER"
        ? "🏆"
        : player.status === "ACTIVE"
        ? "✓"
        : player.status === "ELIMINATED"
        ? "✗"
        : "?";

    console.log(
      `║   ${p.name.padEnd(20)} Lives: ${
        player.lives
      }    Status: ${player.status.padEnd(11)} ${statusIcon}`.padEnd(57) + "║"
    );
  }

  console.log("╚════════════════════════════════════════════════════════╝\n");
}

export async function displayGameSummary(
  program: Program<DiamondArena>,
  roomPda: PublicKey,
  players: Array<{ name: string; keypair: anchor.web3.Keypair }>,
  pdas: Pdas
) {
  const room = await getRoomData(program, roomPda);

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║ GAME SUMMARY".padEnd(57) + "║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║ Final Round: ${room.currentRound}`.padEnd(57) + "║");
  console.log(
    `║ Winner: ${(room.winner === "None"
      ? "Still playing..."
      : room.winner
    ).slice(0, 40)}`.padEnd(57) + "║"
  );
  console.log("╠════════════════════════════════════════════════════════╣");

  for (const p of players) {
    const playerPda = pdas.playerStates[p.keypair.publicKey.toBase58()];
    const player = await getPlayerData(program, playerPda);
    const status = player.status;

    let icon = "";
    if (status === "WINNER") icon = "🏆 WINNER";
    else if (status === "ELIMINATED") icon = "💀 ELIMINATED";
    else if (status === "ACTIVE") icon = "⚔️  FIGHTING";
    else icon = "❓ UNKNOWN";

    console.log(
      `║ ${p.name.padEnd(20)} | Lives: ${player.lives} | ${icon.padEnd(25)}║`
    );
  }

  console.log("╚════════════════════════════════════════════════════════╝\n");
}
