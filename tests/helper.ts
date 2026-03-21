import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { expect } from "chai";
import { DiamondArena } from "../target/types/diamond_arena";

// PDA derivation helper
export function derivePda(
  seeds: (Buffer | Uint8Array)[],
  program: Program<DiamondArena>
) {
  return PublicKey.findProgramAddressSync(seeds, program.programId);
}

export function getNonce(): anchor.BN {
  return new anchor.BN(randomBytes(8));
}

export const logTransactionResult = (label: string, txSignature: string) => {
  console.log(`\n${label}:`);
  console.log(`   Txn signature: ${txSignature}`);
};
