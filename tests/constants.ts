import { SystemProgram } from "@solana/web3.js";

export const ROOM_SEED = Buffer.from("room");
export const PLAYER_STATE_SEED = Buffer.from("player_state");
export const CONFIG_SEED = Buffer.from("config");
export const PLAYER_ROUND_CHOICE_SEED = Buffer.from("player_round_choice");
export const SYSTEM_PROGRAM = SystemProgram.programId;
export const VAULT_SEED = Buffer.from("vault");
