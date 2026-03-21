import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DiamondArena } from "../target/types/diamond_arena";
import fs from "fs";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import {
  derivePda,
  expectAnchorError,
  getNonce,
  logTransactionResult,
} from "./helper";
const TREASURY = new PublicKey("treynHHxg2ftG3Hzn5dypVZX593Yss6uU54puVE614D");
export const SYSTEM_PROGRAM = SystemProgram.programId;

describe("diamond_arena", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet as anchor.Wallet;

  const program = anchor.workspace.diamondArena as Program<DiamondArena>;

  let programDataAddress: PublicKey;

  const player2 = Keypair.generate();
  const player3 = Keypair.generate();
  const player4 = Keypair.generate();

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
    // it("should initialize config", async () => {
    //   const programData = programDataAddress;

    //   const tx = await program.methods
    //     .initialzeConfig(TREASURY, 100) // 1%
    //     .accounts({
    //       admin: admin.publicKey,
    //       //@ts-ignore
    //       config: configPda,
    //       systemProgram: SYSTEM_PROGRAM,
    //       thisProgram: program.programId,
    //       programData,
    //     })
    //     .rpc();

    //   logTransactionResult("Config initialized", tx);
    //   expect(tx).to.exist;

    //   const configAccount = await program.account.config.fetch(configPda);
    //   // console.log("config account:", configAccount);
    //   expect(configAccount.admin.toBase58()).equals(admin.publicKey.toBase58());
    //   expect(configAccount.feeBps).equals(100);
    //   expect(configAccount.treasury.toBase58()).equals(TREASURY.toBase58());
    // });

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
      console.log("room account:", roomAccount);
      expect(roomAccount.roomId.eq(roomId)).to.be.true;
      expect(roomAccount.entryFee.eq(entryFee)).to.be.true;
    });

    it("should allow player-1 to join room", async () => {
      const tx = await program.methods
        .joinRoom(roomId)
        .accounts({
          player: admin.publicKey,
          //@ts-ignore
          room: roomPda,
          playerState: player1StatePda,
          vault: vaultPda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      logTransactionResult("Player-1 joined room", tx);
      expect(tx).to.exist;

      // Verify player state
      const playerState = await program.account.playerState.fetch(
        player1StatePda
      );
      console.log("player state", playerState);

      expect(playerState.player.toString()).to.equal(
        admin.publicKey.toString()
      );
      expect(playerState.roomId.eq(roomId)).to.be.true;
      expect(playerState.lives).to.equal(3);
      expect(playerState.joinedAtRound).to.equal(0);
      // status enum check
      expect(playerState.status.active).to.not.equal(undefined);
    });

    it("should allow player-2 to join room", async () => {
      const tx = await program.methods
        .joinRoom(roomId)
        .accounts({
          player: player2.publicKey,
          //@ts-ignore
          room: roomPda,
          playerState: player2StatePda,
          vault: vaultPda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([player2])
        .rpc();

      logTransactionResult("Player-2 joined room", tx);
      expect(tx).to.exist;

      // Verify player state
      const playerState = await program.account.playerState.fetch(
        player2StatePda
      );
      console.log("player state", playerState);

      expect(playerState.player.toString()).to.equal(
        player2.publicKey.toString()
      );
      expect(playerState.roomId.eq(roomId)).to.be.true;
      expect(playerState.lives).to.equal(3);
      expect(playerState.joinedAtRound).to.equal(0);
      // status enum check
      expect(playerState.status.active).to.not.equal(undefined);
    });

    it("should allow player-3 to join room", async () => {
      const tx = await program.methods
        .joinRoom(roomId)
        .accounts({
          player: player3.publicKey,
          //@ts-ignore
          room: roomPda,
          playerState: player3StatePda,
          vault: vaultPda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([player3])
        .rpc();

      logTransactionResult("Player-3 joined room", tx);
      expect(tx).to.exist;

      // Verify player state
      const playerState = await program.account.playerState.fetch(
        player3StatePda
      );
      console.log("player state", playerState);

      expect(playerState.player.toString()).to.equal(
        player3.publicKey.toString()
      );
      expect(playerState.roomId.eq(roomId)).to.be.true;
      expect(playerState.lives).to.equal(3);
      expect(playerState.joinedAtRound).to.equal(0);
      // status enum check
      expect(playerState.status.active).to.not.equal(undefined);
    });

    it("should update room current_players to 3", async () => {
      const roomAccount = await program.account.room.fetch(roomPda);
      expect(roomAccount.currentPlayers).to.equal(3);
    });

    it("should start the match", async () => {
      const tx = await program.methods
        .startMatch(roomId)
        .accounts({
          authority: admin.publicKey,
          //@ts-ignore
          room: roomPda,
        })
        .rpc();

      logTransactionResult("Match started:", tx);
      expect(tx).to.exist;

      // Verify match is active
      const roomAccount = await program.account.room.fetch(roomPda);
      expect(roomAccount.status.active).to.not.equal(undefined);
      expect(roomAccount.currentRound).to.equal(1);
      expect(roomAccount.commitDeadline.toNumber()).to.be.greaterThan(0);
      expect(roomAccount.revealDeadline.toNumber()).to.be.greaterThan(
        roomAccount.commitDeadline.toNumber()
      );
    });

    it("should allow player1 to submit pick", async () => {
      const pick = 20;
      const tx = await program.methods
        .submitPick(roomId, round, pick)
        .accounts({
          player: admin.publicKey,
          //@ts-ignore
          room: roomPda,
          playerState: player1StatePda,
          playerRoundChoice: player1ChoicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      logTransactionResult(`Player-1 submitted pick ${pick}`, tx);
      expect(tx).to.exist;

      // Verify choice was recorded
      const choiceAccount = await program.account.playerRoundChoice.fetch(
        player1ChoicePda
      );
      console.log("choice account", choiceAccount);
      expect(choiceAccount.roomId.eq(roomId)).to.be.true;
      expect(choiceAccount.round).to.equal(round);

      expect(choiceAccount.player.toString()).to.equal(
        admin.publicKey.toString()
      );
      expect(choiceAccount.pick).to.equal(pick);
      expect(choiceAccount.committed).to.equal(true);
      expect(choiceAccount.revealed).to.equal(false);
    });

    it("should allow player-2 to submit pick", async () => {
      const pick = 22;
      const tx = await program.methods
        .submitPick(roomId, round, pick)
        .accounts({
          player: player2.publicKey,
          //@ts-ignore
          room: roomPda,
          playerState: player2StatePda,
          playerRoundChoice: player2ChoicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([player2])
        .rpc();

      logTransactionResult(`Player-2 submitted pick ${pick}`, tx);
      expect(tx).to.exist;

      // Verify choice was recorded
      const choiceAccount = await program.account.playerRoundChoice.fetch(
        player2ChoicePda
      );
      console.log("choice account", choiceAccount);
      expect(choiceAccount.roomId.eq(roomId)).to.be.true;
      expect(choiceAccount.round).to.equal(round);

      expect(choiceAccount.player.toString()).to.equal(
        player2.publicKey.toString()
      );
      expect(choiceAccount.pick).to.equal(pick);
      expect(choiceAccount.committed).to.equal(true);
      expect(choiceAccount.revealed).to.equal(false);
    });

    it("should allow player-3 to submit pick", async () => {
      const pick = 32;
      const tx = await program.methods
        .submitPick(roomId, round, pick)
        .accounts({
          player: player3.publicKey,
          //@ts-ignore
          room: roomPda,
          playerState: player3StatePda,
          playerRoundChoice: player3ChoicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([player3])
        .rpc();

      logTransactionResult(`Player-3 submitted pick ${pick}`, tx);
      expect(tx).to.exist;

      // Verify choice was recorded
      const choiceAccount = await program.account.playerRoundChoice.fetch(
        player3ChoicePda
      );
      console.log("choice account", choiceAccount);
      expect(choiceAccount.roomId.eq(roomId)).to.be.true;
      expect(choiceAccount.round).to.equal(round);

      expect(choiceAccount.player.toString()).to.equal(
        player3.publicKey.toString()
      );
      expect(choiceAccount.pick).to.equal(pick);
      expect(choiceAccount.committed).to.equal(true);
      expect(choiceAccount.revealed).to.equal(false);
    });
  });
});
