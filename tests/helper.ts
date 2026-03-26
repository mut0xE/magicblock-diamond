import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { randomBytes } from "crypto";
import { expect } from "chai";
import { DiamondArena } from "../target/types/diamond_arena";
import fs from "fs";
import { DEVNET_ASIA_VALIDATOR, erProvider } from "./constants";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";

export type Layer = "L1" | "ER";

const LAYER_LABEL: Record<Layer, string> = {
  L1: "SOLANA",
  ER: "ER",
};

export type RoundPlayer = {
  name: string;
  keypair: anchor.web3.Keypair;
  pick: number;
};

// Load player from file
export function loadPlayer(filePath: string): anchor.web3.Keypair {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(data));
}
export async function getPlayerChoiceByPlayer(
  program: Program<DiamondArena>,
  roomId: BN,
  player: PublicKey
) {
  const choicePda = getPlayerRoundChoicePda(roomId, player, program);
  return await getPlayerChoice(program, choicePda);
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

export const logTx = (label: string, sig: string, layer: Layer = "L1") => {
  console.log(`\n   ${LAYER_LABEL[layer]}  ${label}`);
  console.log(`   sig: ${sig}`);
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

export function getRoomPda(
  roomId: BN,
  program: Program<DiamondArena>
): PublicKey {
  return getPda(
    [Buffer.from("room"), roomId.toArrayLike(Buffer, "le", 8)],
    program
  );
}

export function getVaultPda(
  roomId: BN,
  program: Program<DiamondArena>
): PublicKey {
  return getPda(
    [Buffer.from("vault"), roomId.toArrayLike(Buffer, "le", 8)],
    program
  );
}

export function getPlayerStatePda(
  roomId: BN,
  player: PublicKey,
  program: Program<DiamondArena>
): PublicKey {
  return getPda(
    [
      Buffer.from("player_state"),
      roomId.toArrayLike(Buffer, "le", 8),
      player.toBuffer(),
    ],
    program
  );
}

export function getPlayerRoundChoicePda(
  roomId: BN,
  player: PublicKey,
  program: Program<DiamondArena>
): PublicKey {
  return getPda(
    [
      Buffer.from("player_round_choice"),
      roomId.toArrayLike(Buffer, "le", 8),
      player.toBuffer(),
    ],
    program
  );
}

export function buildAllPdas(
  roomId: BN,
  players: PublicKey[],
  program: Program<DiamondArena>
) {
  const room = getRoomPda(roomId, program);
  const vault = getVaultPda(roomId, program);

  const playerStates: { [key: string]: PublicKey } = {};
  for (const player of players) {
    playerStates[player.toBase58()] = getPlayerStatePda(
      roomId,
      player,
      program
    );
  }

  const playerChoices: { [key: string]: PublicKey } = {};
  for (const player of players) {
    playerChoices[player.toBase58()] = getPlayerRoundChoicePda(
      roomId,
      player,
      program
    );
  }

  return { room, vault, playerStates, playerChoices };
}

export function printState(
  label: number | string,
  players: Array<{ name: string; lives: number }>
) {
  const title =
    typeof label === "number" ? `⚡ ER  ·  after round ${label}` : `${label}`;
  const width = 36;
  const bar = "─".repeat(width);

  console.log(`\n  ┌${bar}┐`);
  console.log(`  │  ${title.padEnd(width - 2)}│`);
  console.log(`  ├${bar}┤`);

  for (const p of players) {
    const hearts = "♥".repeat(p.lives) + "♡".repeat(Math.max(0, 3 - p.lives));
    const status = p.lives === 0 ? "ELIM" : p.lives >= 3 ? " WIN" : "  ok";
    const line = `${p.name.padEnd(10)} ${hearts.padEnd(5)}  ${
      p.lives
    } hp  ${status}`;
    console.log(`  │  ${line.padEnd(width - 2)}│`);
  }

  console.log(`  └${bar}┘\n`);
}

/**
 * Runs a full round on ER: submits picks, waits, finalizes, prints outcome.
 * Returns the updated lives map  { playerPubkey: lives }
 */
export async function runRound(
  program: Program<DiamondArena>,
  admin: anchor.web3.Keypair,
  roomId: BN,
  roundNum: number,
  activePlayers: RoundPlayer[],
  allPlayers: RoundPlayer[],
  pdas: ReturnType<typeof buildAllPdas>
): Promise<Map<string, number>> {
  const picksStr = activePlayers.map((p) => `${p.name}=${p.pick}`).join("  ");
  console.log(`\n${"━".repeat(56)}`);
  console.log(`  ⚡ ROUND ${roundNum}   picks: ${picksStr}`);
  console.log(`${"━".repeat(56)}`);

  // 1. submit picks to ER
  for (const p of activePlayers) {
    const tx = await submitPickViaMagicRouter(
      program,
      p.keypair,
      roomId,
      roundNum,
      p.pick
    );
    logTx(`${p.name} → pick ${p.pick}`, tx, "ER");
  }

  await wait(20000);

  // 2. read picks + lives before finalize
  const picksFromER = new Map<string, number | null>();
  const livesBeforeFinalize = new Map<string, number>();

  for (const p of allPlayers) {
    const key = p.keypair.publicKey.toBase58();

    const choicePda = getPlayerRoundChoicePda(
      roomId,
      p.keypair.publicKey,
      program
    );

    const choice = await getPlayerRoundChoiceFromER(
      erProvider.connection,
      program,
      choicePda
    );
    picksFromER.set(key, choice?.pick ?? null);

    const state = await getPlayerStateFromER(
      erProvider.connection,
      program,
      pdas.playerStates[key]
    );
    livesBeforeFinalize.set(key, state?.lives ?? 0);
  }

  // 3. finalize on ER
  const finalTx = await finalizeRoundViaMagicRouter(
    program,
    admin,
    roomId,
    activePlayers.map((p) => p.keypair),
    roundNum,
    pdas
  );
  logTx(`Round ${roundNum} finalized`, finalTx, "ER");

  await wait(500);

  // 4. read lives + status after finalize
  const livesAfterFinalize = new Map<string, number>();
  const statusAfterFinalize = new Map<string, string>();

  for (const p of allPlayers) {
    const key = p.keypair.publicKey.toBase58();

    const state = await getPlayerStateFromER(
      erProvider.connection,
      program,
      pdas.playerStates[key]
    );

    livesAfterFinalize.set(key, state?.lives ?? 0);
    statusAfterFinalize.set(key, getStatusName(state?.status ?? {}));
  }

  // 5. display using ER data only
  await displayRoundOutcomeFromER(
    program,
    roomId,
    allPlayers,
    pdas.room,
    picksFromER,
    livesBeforeFinalize,
    livesAfterFinalize,
    statusAfterFinalize
  );

  return livesAfterFinalize;
}

export async function finalizeRoundViaMagicRouter(
  program: Program<DiamondArena>,
  signer: anchor.web3.Keypair,
  roomId: BN,
  activePlayers: anchor.web3.Keypair[],
  round: number,
  pdas: ReturnType<typeof buildAllPdas>
): Promise<string> {
  const remainingAccounts = [];

  for (const player of activePlayers) {
    const key = player.publicKey.toBase58();
    const playerStatePda = pdas.playerStates[key];
    const choicePda = getPlayerRoundChoicePda(
      roomId,
      player.publicKey,
      program
    );

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

  const ix = await program.methods
    .finalizeRound(roomId)
    .accounts({
      finalizer: signer.publicKey,
      //@ts-ignore
      room: pdas.room,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  const latestBlockhash = await erProvider.connection.getLatestBlockhash();

  const tx = new Transaction().add(ix);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  const signature = await erProvider.connection.sendTransaction(tx, [signer], {
    skipPreflight: true,
  });

  await erProvider.connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });

  return signature;
}

export async function delegatePlayerRoundChoice(
  program: Program<DiamondArena>,
  payer: anchor.web3.Keypair,
  roomId: anchor.BN,
  player: PublicKey,
  playerRoundChoicePda: PublicKey
): Promise<string> {
  return await program.methods
    .delegateInput({ playerChoice: { roomId, player: player } })
    .accounts({
      payer: payer.publicKey,
      pda: playerRoundChoicePda,
      //@ts-ignore
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
}

// Join room
export async function joinRoom(
  program: Program<DiamondArena>,
  player: anchor.web3.Keypair,
  roomId: BN
): Promise<string> {
  const playerPubkey = player.publicKey;
  const playerStatePda = getPlayerStatePda(roomId, playerPubkey, program);
  const choicePda = getPlayerRoundChoicePda(roomId, playerPubkey, program);

  const playerRoundChoicePda = getPlayerRoundChoicePda(
    roomId,
    playerPubkey,
    program
  );

  console.log("joining:", playerPubkey.toBase58());
  console.log("playerStatePda:", playerStatePda.toBase58());
  console.log("playerRoundChoicePda:", playerRoundChoicePda.toBase58());
  const tx = await program.methods
    .joinRoom(roomId)
    .accounts({
      player: playerPubkey,
      //@ts-ignore
      room: getRoomPda(roomId, program),
      playerState: playerStatePda,
      vault: getVaultPda(roomId, program),
      playerRoundChoice: choicePda,
      systemProgram: SystemProgram.programId,
    })
    .signers([player])
    .rpc();

  return tx;
}

// export async function submitPick(
//   program: Program<DiamondArena>,
//   player: anchor.web3.Keypair,
//   roomId: BN,
//   round: number,
//   pick: number
// ): Promise<string> {
//   const playerPubkey = player.publicKey;
//   const playerStatePda = getPlayerStatePda(roomId, playerPubkey, program);
//   const choicePda = getPlayerRoundChoicePda(roomId, playerPubkey, program);

//   const tx = await program.methods
//     .submitPick(roomId, round, pick)
//     .accounts({
//       player: playerPubkey,
//       //@ts-ignore
//       room: getRoomPda(roomId, program),
//       playerState: playerStatePda,
//       playerRoundChoice: choicePda,
//       systemProgram: SystemProgram.programId,
//     })
//     .signers([player])
//     .rpc();

//   return tx;
// }

export async function submitPickViaMagicRouter(
  program: Program<DiamondArena>,
  signer: anchor.web3.Keypair,
  roomId: BN,
  round: number,
  pick: number
): Promise<string> {
  const playerPubkey = signer.publicKey;
  const playerStatePda = getPlayerStatePda(roomId, playerPubkey, program);
  const choicePda = getPlayerRoundChoicePda(roomId, playerPubkey, program);
  const roomPda = getRoomPda(roomId, program);

  const ix = await program.methods
    .submitPick(roomId, round, pick)
    .accounts({
      player: playerPubkey,
      //@ts-ignore
      room: roomPda,
      playerState: playerStatePda,
      playerRoundChoice: choicePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const latestBlockhash = await erProvider.connection.getLatestBlockhash();

  const tx = new Transaction().add(ix);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  const signature = await erProvider.connection.sendTransaction(tx, [signer], {
    skipPreflight: true,
  });

  await erProvider.connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });

  return signature;
}

export async function finalizeRound(
  program: Program<DiamondArena>,
  admin: anchor.web3.Keypair,
  roomId: BN,
  activePlayers: anchor.web3.Keypair[]
): Promise<string> {
  const remainingAccounts = [];

  for (const player of activePlayers) {
    const playerPubkey = player.publicKey;
    const playerStatePda = getPlayerStatePda(roomId, playerPubkey, program);
    const choicePda = getPlayerRoundChoicePda(roomId, playerPubkey, program);

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
      room: getRoomPda(roomId, program),
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
    .delegateInput({ playerState: { roomId, player: player } })
    .accounts({
      payer: payer.publicKey,
      pda: playerStatePda,
      //@ts-ignore
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

export async function startMatchViaMagicRouter(
  program: Program<DiamondArena>,
  signer: anchor.web3.Keypair,
  roomId: BN,
  roomPda: anchor.web3.PublicKey
): Promise<string> {
  console.log("\nStarting match via Magic Router...");
  console.log(`   Room ID: ${roomId.toString()}`);
  console.log(`   Signer: ${signer.publicKey.toString()}\n`);

  // Build instruction
  const startMatchIx = await program.methods
    .startMatch(roomId)
    .accounts({
      authority: signer.publicKey,
      //@ts-ignore
      room: roomPda,
    })
    .instruction();

  const latestBlockhash = await erProvider.connection.getLatestBlockhash();

  // Build transaction
  const tx = new Transaction().add(startMatchIx);

  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  const signature = await erProvider.connection.sendTransaction(tx, [signer], {
    skipPreflight: true,
  });

  await erProvider.connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });

  return signature;
}

/** Returns a random pick in [min, max] rounded to nearest step. */
export function randomPick(min = 10, max = 90, step = 5): number {
  const steps = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * steps) * step;
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

/**
 * Generic helper to deserialize ANY account from ER/fast tier
 * Works for Room, PlayerState, PlayerRoundChoice, etc.
 */
export async function deserializeAccountFromER<T>(
  erConnection: Connection,
  program: anchor.Program,
  accountName: string,
  pda: PublicKey
): Promise<T | null> {
  try {
    const accountInfo = await erConnection.getAccountInfo(pda);

    if (!accountInfo) {
      console.warn(`${accountName} not found on ER: ${pda.toBase58()}`);
      return null;
    }

    return program.coder.accounts.decode(accountName, accountInfo.data) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to deserialize ${accountName}: ${message}`);
    throw error;
  }
}

/**
 *  Deserialize Room specifically
 */
export async function getRoomFromER(
  erConnection: Connection,
  program: anchor.Program<any>,
  roomPda: PublicKey
): Promise<any> {
  return deserializeAccountFromER(erConnection, program, "room", roomPda);
}

/**
 *  Deserialize PlayerState specifically
 */
export async function getPlayerStateFromER(
  erConnection: Connection,
  program: anchor.Program<any>,
  playerStatePda: PublicKey
): Promise<any> {
  return deserializeAccountFromER(
    erConnection,
    program,
    "playerState",
    playerStatePda
  );
}

/**
 *  Deserialize PlayerRoundChoice specifically
 */
export async function getPlayerRoundChoiceFromER(
  erConnection: Connection,
  program: anchor.Program<any>,
  choicePda: PublicKey
): Promise<any> {
  return deserializeAccountFromER(
    erConnection,
    program,
    "playerRoundChoice",
    choicePda
  );
}

/**
 * Batch deserialize multiple accounts from ER
 */
export async function deserializeMultipleFromER<T>(
  erConnection: Connection,
  program: anchor.Program<any>,
  accounts: Array<{
    name: string;
    pda: PublicKey;
  }>
): Promise<T[]> {
  const results = await Promise.all(
    accounts.map((account) =>
      deserializeAccountFromER(
        erConnection,
        program,
        account.name,
        account.pda
      ).catch((error) => {
        console.error(`Failed to deserialize ${account.name}:`, error.message);
        return null;
      })
    )
  );

  console.log(`Batch deserialization complete\n`);
  return results as T[];
}

/**
 * Helper to get all player states from ER
 */
export async function getAllPlayerStatesFromER(
  erConnection: Connection,
  program: anchor.Program<any>,
  playerStatePdas: Map<string, PublicKey> // player name -> PDA
): Promise<Map<string, any>> {
  const results = new Map<string, any>();

  for (const [playerName, pda] of playerStatePdas) {
    try {
      const state = await getPlayerStateFromER(erConnection, program, pda);
      if (state) {
        results.set(playerName, state);
        console.log(
          `${playerName}: Lives=${state.lives}, Status=${JSON.stringify(
            state.status
          )}`
        );
      }
    } catch (error) {
      console.error(`Failed to fetch ${playerName}:`, error.message);
    }
  }

  console.log("");
  return results;
}

/**
 * Pretty print account from ER
 */
export async function printAccountFromER(
  erConnection: Connection,
  program: anchor.Program<any>,
  accountName: string,
  pda: PublicKey,
  title?: string
): Promise<void> {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║ ${(title || accountName.toUpperCase()).padEnd(40)}║`);
  console.log(`╠════════════════════════════════════════╣`);

  const account = await deserializeAccountFromER(
    erConnection,
    program,
    accountName,
    pda
  );

  if (!account) {
    console.log("║ Account not found                      ║");
  } else {
    const json = JSON.stringify(account, null, 2);
    const lines = json.split("\n");

    for (const line of lines.slice(0, 15)) {
      // Limit to first 15 lines
      const truncated = line.substring(0, 38);
      console.log(`║ ${truncated.padEnd(38)}║`);
    }

    if (lines.length > 15) {
      console.log(`║ ... (${lines.length - 15} more lines)      ║`);
    }
  }

  console.log(`╚════════════════════════════════════════╝\n`);
}

/**
 * Quick snapshot: Get Room + all PlayerStates from ER
 */
export async function getGameStateFromER(
  erConnection: Connection,
  program: anchor.Program<any>,
  roomPda: PublicKey,
  playerStatePdas: PublicKey[]
): Promise<{
  room: any;
  playerStates: any[];
}> {
  console.log(`\nTaking game state snapshot from ER...\n`);

  // Get room
  const room = await getRoomFromER(erConnection, program, roomPda);

  // Get all player states
  const playerStates = await Promise.all(
    playerStatePdas.map((pda) =>
      getPlayerStateFromER(erConnection, program, pda)
    )
  );

  console.log(`Snapshot complete\n`);
  console.log(`Room: ${JSON.stringify(room, null, 2)}`);
  console.log(`Player States: ${JSON.stringify(playerStates, null, 2)}\n`);

  return { room, playerStates };
}

export async function displayRoundOutcomeFromER(
  program: Program<DiamondArena>,
  roomId: BN,
  players: Array<{ name: string; keypair: anchor.web3.Keypair }>,
  roomPda: PublicKey,
  picksFromER: Map<string, number | null>,
  livesBefore: Map<string, number>,
  livesAfter: Map<string, number>,
  statusAfter: Map<string, string>
) {
  const room = await getRoomFromER(erProvider.connection, program, roomPda);

  const rows: Array<{
    name: string;
    pick: number | null;
    before: number;
    after: number;
    livesLost: number;
    status: string;
  }> = [];

  for (const p of players) {
    const key = p.keypair.publicKey.toBase58();

    const before = livesBefore.get(key) ?? 0;
    const after = livesAfter.get(key) ?? 0;

    rows.push({
      name: p.name,
      pick: picksFromER.get(key) ?? null,
      before,
      after,
      livesLost: before - after,
      status: statusAfter.get(key) ?? "UNKNOWN",
    });
  }

  const displayedRound = room.status?.finished
    ? room.currentRound
    : room.currentRound - 1;

  console.log("\n" + "═".repeat(66));
  console.log(`  ⚡ ROUND ${displayedRound} RESULT         [Ephemeral Rollup]`);
  console.log("═".repeat(66));
  console.log(
    `  ${"Player".padEnd(10)} ${"Pick".padEnd(6)} ${"Before".padEnd(
      8
    )} ${"After".padEnd(8)} ${"Status".padEnd(12)} Outcome`
  );
  console.log("─".repeat(66));

  for (const row of rows) {
    const wasActive = row.before > 0;
    const pickStr =
      row.pick === null ? "—".padEnd(4) : String(row.pick).padEnd(4);

    const beforeHp =
      "♥".repeat(row.before) + "♡".repeat(Math.max(0, 3 - row.before));
    const afterHp =
      "♥".repeat(row.after) + "♡".repeat(Math.max(0, 3 - row.after));

    let outcome: string;

    if (!wasActive) {
      outcome = "already eliminated";
    } else if (row.livesLost === 0) {
      outcome = "round winner";
    } else if (row.livesLost === 2) {
      outcome = "collision penalty (-2)";
    } else if (row.after === 0 || row.status === "ELIMINATED") {
      outcome = "eliminated";
    } else if (row.livesLost === 1) {
      outcome = "-1 life";
    } else {
      outcome = "no change";
    }

    console.log(
      `  ${row.name.padEnd(10)} ${pickStr}   ${beforeHp.padEnd(
        8
      )} ${afterHp.padEnd(8)} ${row.status.padEnd(12)} ${outcome}`
    );
  }

  console.log("─".repeat(66));
  console.log(
    `  Room status: ${JSON.stringify(room.status)} | currentRound on room: ${
      room.currentRound
    }`
  );
  console.log("═".repeat(66) + "\n");
}
