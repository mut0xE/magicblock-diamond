import { AnchorProvider } from "@coral-xyz/anchor";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

export const ROOM_SEED = Buffer.from("room");
export const PLAYER_STATE_SEED = Buffer.from("player_state");
export const CONFIG_SEED = Buffer.from("config");
export const PLAYER_ROUND_CHOICE_SEED = Buffer.from("player_round_choice");
export const SYSTEM_PROGRAM = SystemProgram.programId;
export const VAULT_SEED = Buffer.from("vault");

export const DEVNET_ASIA_VALIDATOR = new PublicKey(
  "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
);

// export const magicConnection = new ConnectionMagicRouter(
//   "https://devnet-router.magicblock.app"
// );

export const providerEphemeralRollup = new Connection(
  process.env.EPHEMERAL_PROVIDER_ENDPOINT || "https://devnet-as.magicblock.app/"
);

export const TEE_VALIDATOR = new PublicKey(
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"
);

// export const PERMISSION_PROGRAM_ID = new PublicKey(
//   "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
// );
