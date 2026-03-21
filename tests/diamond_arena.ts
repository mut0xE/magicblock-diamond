import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DiamondArena } from "../target/types/diamond_arena";
import fs from "fs";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import { derivePda, getNonce, logTransactionResult } from "./helper";
const TREASURY = new PublicKey("treynHHxg2ftG3Hzn5dypVZX593Yss6uU54puVE614D");
export const SYSTEM_PROGRAM = SystemProgram.programId;

describe("diamond_arena", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet as anchor.Wallet;

  const program = anchor.workspace.diamondArena as Program<DiamondArena>;

  let programDataAddress: PublicKey;

  const player2 = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(
          "/Users/mut0xE/Downloads/keys/us68r6awy9CVvUkJ58jEY1Bxp4sjpuyQZZys41hNH9S.json",
          "utf8"
        )
      )
    )
  );

  const player3 = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(
          "/Users/mut0xE/Downloads/keys/b1sjj58RYydHb7bm2PhQ1ALxWVayLd1VofW2o6gTQX4.json",
          "utf8"
        )
      )
    )
  );
  // const player4 = Keypair.generate();
  const player4 = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(
          "/Users/mut0xE/Downloads/keys/b2M6wZCujvcaKms27aLnsfNhhM5LLdygutwqJb9Uzn2.json",
          "utf8"
        )
      )
    )
  );

  const roomId = getNonce();
  const entryFee = new BN(0.1 * LAMPORTS_PER_SOL);
  const round = 1;

  // PDA derivation

  const [configPda] = derivePda([Buffer.from("config")], program);

  const [roomPda] = derivePda(
    [Buffer.from("room"), roomId.toArrayLike(Buffer, "le", 8)],
    program
  );

  const [vaultPda] = derivePda(
    [Buffer.from("vault"), roomId.toArrayLike(Buffer, "le", 8)],
    program
  );

  const [player1StatePda] = derivePda(
    [
      Buffer.from("player_state"),
      roomId.toArrayLike(Buffer, "le", 8),
      admin.publicKey.toBuffer(),
    ],
    program
  );

  const [player2StatePda] = derivePda(
    [
      Buffer.from("player_state"),
      roomId.toArrayLike(Buffer, "le", 8),
      player2.publicKey.toBuffer(),
    ],
    program
  );

  const [player3StatePda] = derivePda(
    [
      Buffer.from("player_state"),
      roomId.toArrayLike(Buffer, "le", 8),
      player3.publicKey.toBuffer(),
    ],
    program
  );

  const [player1ChoicePda] = derivePda(
    [
      Buffer.from("player_round_choice"),
      roomId.toArrayLike(Buffer, "le", 8),
      Buffer.from([round]),
      admin.publicKey.toBuffer(),
    ],
    program
  );
  const [player2ChoicePda] = derivePda(
    [
      Buffer.from("player_round_choice"),
      roomId.toArrayLike(Buffer, "le", 8),
      Buffer.from([round]),
      player2.publicKey.toBuffer(),
    ],
    program
  );
  const [player3ChoicePda] = derivePda(
    [
      Buffer.from("player_round_choice"),
      roomId.toArrayLike(Buffer, "le", 8),
      Buffer.from([round]),
      player3.publicKey.toBuffer(),
    ],
    program
  );

  before(async () => {
    console.log("Setting up devnet test environment...");
    console.log(`Admin: ${admin.publicKey}`);
    console.log(`Player2: ${player2.publicKey}`);
    console.log(`Treasury: ${TREASURY}`);

    [programDataAddress] = PublicKey.findProgramAddressSync(
      [program.programId.toBytes()],
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    );

    console.log("Accounts funded successfully");
  });

  describe("Happy Path: Complete Game Flow", () => {
    it("should initialize config", async () => {
      const programData = programDataAddress;

      const tx = await program.methods
        .initialzeConfig(TREASURY, 100) // 1%
        .accounts({
          admin: admin.publicKey,
          //@ts-ignore
          config: configPda,
          systemProgram: SYSTEM_PROGRAM,
          thisProgram: program.programId,
          programData,
        })
        .rpc();

      logTransactionResult("Config initialized", tx);
      expect(tx).to.exist;

      const configAccount = await program.account.config.fetch(configPda);
      // console.log("config account:", configAccount);
      expect(configAccount.admin.toBase58()).equals(admin.publicKey.toBase58());
      expect(configAccount.feeBps).equals(100);
      expect(configAccount.treasury.toBase58()).equals(TREASURY.toBase58());
    });

    it("should create a room", async () => {
      const tx = await program.methods
        .createRoom(roomId, entryFee, 3) // max 3 players
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: roomPda,
          vault: vaultPda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      logTransactionResult("Room created", tx);
      expect(tx).to.exist;

      // Verify room state
      const roomAccount = await program.account.room.fetch(roomPda);
      // console.log("room account:", roomAccount);
      expect(roomAccount.roomId.eq(roomId)).to.be.true;
      expect(roomAccount.entryFee.eq(entryFee)).to.be.true;
    });
  });
});
