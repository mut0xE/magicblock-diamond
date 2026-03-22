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
import { DEVNET_ASIA_VALIDATOR, providerEphemeralRollup } from "./constants";
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

export async function delegatePlayerRoundChoice(
  program: Program<DiamondArena>,
  payer: anchor.web3.Keypair,
  roomId: anchor.BN,
  player: PublicKey,
  playerRoundChoicePda: PublicKey
): Promise<string> {
  return await program.methods
    .delegatePlayerChoice(roomId, player)
    .accounts({
      payer: payer.publicKey,
      //@ts-ignore
      playerRoundChoice: playerRoundChoicePda,
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

export async function submitPick(
  program: Program<DiamondArena>,
  player: anchor.web3.Keypair,
  roomId: BN,
  round: number,
  pick: number
): Promise<string> {
  const playerPubkey = player.publicKey;
  const playerStatePda = getPlayerStatePda(roomId, playerPubkey, program);
  const choicePda = getPlayerRoundChoicePda(roomId, playerPubkey, program);

  const tx = await program.methods
    .submitPick(roomId, round, pick)
    .accounts({
      player: playerPubkey,
      //@ts-ignore
      room: getRoomPda(roomId, program),
      playerState: playerStatePda,
      playerRoundChoice: choicePda,
      systemProgram: SystemProgram.programId,
    })
    .signers([player])
    .rpc();

  return tx;
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

  const latestBlockhash = await providerEphemeralRollup.getLatestBlockhash();

  // Build transaction
  const tx = new Transaction().add(startMatchIx);

  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  const signature = await providerEphemeralRollup.sendTransaction(
    tx,
    [signer],
    {
      skipPreflight: true,
    }
  );

  await providerEphemeralRollup.confirmTransaction({
    signature,
    ...latestBlockhash,
  });

  return signature;
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
