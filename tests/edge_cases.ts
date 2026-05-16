import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DiamondArena } from "../target/types/diamond_arena";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import {
  buildAllPdas,
  expectAnchorError,
  getPda,
  getPlayerRoundChoicePda,
  getPlayerStatePda,
  getRoomId,
  getRoomPda,
  getVaultPda,
  joinRoom,
  loadPlayer,
  logTx,
  wait,
} from "./helper";
import { CONFIG_SEED } from "./constants";

const TREASURY = new PublicKey("treynHHxg2ftG3Hzn5dypVZX593Yss6uU54puVE614D");
const SYSTEM_PROGRAM = SystemProgram.programId;

describe("diamond_arena - Edge Cases & Failures", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.diamondArena as Program<DiamondArena>;

  let player1: anchor.web3.Keypair;
  let player2: anchor.web3.Keypair;
  let player3: anchor.web3.Keypair;
  let configPda: PublicKey;

  before(async () => {
    player1 = admin.payer;
    player2 = loadPlayer(
      "/Users/mut0xE/Downloads/keys/us68r6awy9CVvUkJ58jEY1Bxp4sjpuyQZZys41hNH9S.json"
    );
    player3 = loadPlayer(
      "/Users/mut0xE/Downloads/keys/b2M6wZCujvcaKms27aLnsfNhhM5LLdygutwqJb9Uzn2.json"
    );
    configPda = getPda([CONFIG_SEED], program);
  });

  describe("Room Creation Failures", () => {
    it("should fail to create room with max_players < 2", async () => {
      const roomId = getRoomId();
      const roomPda = getRoomPda(roomId, program);
      const vaultPda = getVaultPda(roomId, program);

      await expectAnchorError(
        program.methods
          .createRoom(roomId, new BN(0.1 * LAMPORTS_PER_SOL), 1)
          .accounts({
            creator: admin.publicKey,
            //@ts-ignore
            room: roomPda,
            vault: vaultPda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "InvalidMaxPlayers"
      );
    });

    it("should fail to create room with max_players > 5", async () => {
      const roomId = getRoomId();
      const roomPda = getRoomPda(roomId, program);
      const vaultPda = getVaultPda(roomId, program);

      await expectAnchorError(
        program.methods
          .createRoom(roomId, new BN(0.1 * LAMPORTS_PER_SOL), 6)
          .accounts({
            creator: admin.publicKey,
            //@ts-ignore
            room: roomPda,
            vault: vaultPda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "InvalidMaxPlayers"
      );
    });

    it("should fail to create room with entry fee below minimum", async () => {
      const roomId = getRoomId();
      const roomPda = getRoomPda(roomId, program);
      const vaultPda = getVaultPda(roomId, program);

      await expectAnchorError(
        program.methods
          .createRoom(roomId, new BN(1000), 3) // 1000 lamports < 0.01 SOL min
          .accounts({
            creator: admin.publicKey,
            //@ts-ignore
            room: roomPda,
            vault: vaultPda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "EntryFeeTooLow"
      );
    });
  });

  describe("Join Room Failures", () => {
    let roomId: BN;
    let pdas: ReturnType<typeof buildAllPdas>;

    before(async () => {
      roomId = getRoomId();
      pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey, player3.publicKey],
        program
      );

      // Create a room with max 2 players
      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 2)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();
    });

    it("should allow player1 to join", async () => {
      const tx = await joinRoom(program, player1, roomId);
      expect(tx).to.exist;
    });

    it("should allow player2 to join", async () => {
      const tx = await joinRoom(program, player2, roomId);
      expect(tx).to.exist;
    });

    it("should fail when room is full (player3 tries to join max=2 room)", async () => {
      await expectAnchorError(joinRoom(program, player3, roomId), "RoomFull");
    });

    it("should fail when player tries to join twice (PlayerAlreadyJoined)", async () => {
      // player1 already joined - the init constraint on player_state PDA
      // will fail since account already exists
      try {
        await joinRoom(program, player1, roomId);
        throw new Error("Expected failure but tx succeeded");
      } catch (err: any) {
        // Account init will fail - either "already in use" or constraint error
        expect(err.message || String(err)).to.not.equal(
          "Expected failure but tx succeeded"
        );
      }
    });
  });

  describe("Start Match Failures", () => {
    let roomId: BN;
    let pdas: ReturnType<typeof buildAllPdas>;

    before(async () => {
      roomId = getRoomId();
      pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey, player3.publicKey],
        program
      );

      // Create room with max 3 but only 1 player joins
      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 3)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      await joinRoom(program, player1, roomId);
    });

    it("should fail to start match with only 1 player", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );

      await expectAnchorError(
        program.methods
          .startMatch(roomId)
          .accounts({
            authority: player1.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: playerStatePda,
          })
          .rpc(),
        "NotEnoughPlayers"
      );
    });

    it("should fail when non-player tries to start match", async () => {
      // player3 hasn't joined this room, so their PlayerState PDA doesn't exist
      const fakePlayerStatePda = getPlayerStatePda(
        roomId,
        player3.publicKey,
        program
      );

      try {
        await program.methods
          .startMatch(roomId)
          .accounts({
            authority: player3.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: fakePlayerStatePda,
          })
          .signers([player3])
          .rpc();
        throw new Error("Expected failure but tx succeeded");
      } catch (err: any) {
        // Should fail - account doesn't exist or PDA constraint fails
        expect(err.message || String(err)).to.not.equal(
          "Expected failure but tx succeeded"
        );
      }
    });
  });

  describe("Submit Pick Failures", () => {
    let roomId: BN;
    let pdas: ReturnType<typeof buildAllPdas>;

    before(async () => {
      roomId = getRoomId();
      pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey],
        program
      );

      // Create room, join both players, start match
      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 2)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      await joinRoom(program, player1, roomId);
      await joinRoom(program, player2, roomId);

      // Start match on L1 (no ER delegation for simple tests)
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      await program.methods
        .startMatch(roomId)
        .accounts({
          authority: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
        })
        .rpc();
    });

    it("should fail with invalid pick > 100", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player1.publicKey,
        program
      );

      await expectAnchorError(
        program.methods
          .submitPick(roomId, 1, 101) // pick=101 > MAX_NUMBER
          .accounts({
            player: player1.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: playerStatePda,
            playerRoundChoice: choicePda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "InvalidPick"
      );
    });

    it("should fail with wrong round number", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player1.publicKey,
        program
      );

      await expectAnchorError(
        program.methods
          .submitPick(roomId, 5, 50) // round 5 but current_round is 1
          .accounts({
            player: player1.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: playerStatePda,
            playerRoundChoice: choicePda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "InvalidRound"
      );
    });

    it("should succeed with valid pick", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player1.publicKey,
        program
      );

      const tx = await program.methods
        .submitPick(roomId, 1, 42)
        .accounts({
          player: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
          playerRoundChoice: choicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      expect(tx).to.exist;
    });

    it("should fail with AlreadyCommitted on same round", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player1.publicKey,
        program
      );

      await expectAnchorError(
        program.methods
          .submitPick(roomId, 1, 55) // already committed for round 1
          .accounts({
            player: player1.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: playerStatePda,
            playerRoundChoice: choicePda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "AlreadyCommitted"
      );
    });

    it("should allow pick=0 (edge of range)", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player2.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player2.publicKey,
        program
      );

      const tx = await program.methods
        .submitPick(roomId, 1, 0)
        .accounts({
          player: player2.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
          playerRoundChoice: choicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([player2])
        .rpc();

      expect(tx).to.exist;
    });
  });

  describe("Finalize Round Failures", () => {
    let roomId: BN;
    let pdas: ReturnType<typeof buildAllPdas>;

    before(async () => {
      roomId = getRoomId();
      pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey],
        program
      );

      // Create, join, start
      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 2)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      await joinRoom(program, player1, roomId);
      await joinRoom(program, player2, roomId);

      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      await program.methods
        .startMatch(roomId)
        .accounts({
          authority: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
        })
        .rpc();
    });

    it("should fail to finalize before reveal deadline passes", async () => {
      // Immediately try to finalize (reveal_deadline hasn't passed)
      const remainingAccounts = [player1, player2].flatMap((p) => [
        {
          pubkey: getPlayerStatePda(roomId, p.publicKey, program),
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: getPlayerRoundChoicePda(roomId, p.publicKey, program),
          isWritable: true,
          isSigner: false,
        },
      ]);

      await expectAnchorError(
        program.methods
          .finalizeRound(roomId)
          .accounts({
            finalizer: admin.publicKey,
            //@ts-ignore
            room: pdas.room,
          })
          .remainingAccounts(remainingAccounts)
          .rpc(),
        "RevealPhaseNotOver"
      );
    });

    it("should succeed after reveal deadline passes", async () => {
      // Submit picks first
      for (const p of [player1, player2]) {
        const playerStatePda = getPlayerStatePda(roomId, p.publicKey, program);
        const choicePda = getPlayerRoundChoicePda(roomId, p.publicKey, program);
        await program.methods
          .submitPick(roomId, 1, Math.floor(Math.random() * 100))
          .accounts({
            player: p.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: playerStatePda,
            playerRoundChoice: choicePda,
            systemProgram: SYSTEM_PROGRAM,
          })
          .signers([p])
          .rpc();
      }

      // Wait for commit+reveal duration to pass (5+2=7s on-chain)
      await wait(9000);

      const remainingAccounts = [player1, player2].flatMap((p) => [
        {
          pubkey: getPlayerStatePda(roomId, p.publicKey, program),
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: getPlayerRoundChoicePda(roomId, p.publicKey, program),
          isWritable: true,
          isSigner: false,
        },
      ]);

      const tx = await program.methods
        .finalizeRound(roomId)
        .accounts({
          finalizer: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

      expect(tx).to.exist;
      logTx("Round finalized on L1", tx, "L1");
    });
  });

  describe("Settle Match Failures", () => {
    let roomId: BN;
    let pdas: ReturnType<typeof buildAllPdas>;

    before(async () => {
      roomId = getRoomId();
      pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey],
        program
      );

      // Create an active room (not finished)
      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 2)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      await joinRoom(program, player1, roomId);
      await joinRoom(program, player2, roomId);

      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      await program.methods
        .startMatch(roomId)
        .accounts({
          authority: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
        })
        .rpc();
    });

    it("should fail to settle an active (unfinished) match", async () => {
      await expectAnchorError(
        program.methods
          .settleMatch(roomId)
          .accounts({
            caller: admin.publicKey,
            //@ts-ignore
            room: pdas.room,
            vault: pdas.vault,
            winner: player1.publicKey,
            config: configPda,
            treasury: TREASURY,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "MatchNotFinished"
      );
    });
  });

  describe("Cancel Room", () => {
    it("should allow creator to cancel a Waiting room (creator must have joined)", async () => {
      const roomId = getRoomId();
      const pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey],
        program
      );

      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 3)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      // Creator joins first (cancel requires player_state PDA)
      await joinRoom(program, player1, roomId);

      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );

      const tx = await program.methods
        .cancelRoom(roomId)
        .accounts({
          caller: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      expect(tx).to.exist;
      logTx("Room cancelled by creator", tx, "L1");

      const room = await program.account.room.fetch(pdas.room);
      expect(room.status.cancelled).to.not.equal(undefined);
    });

    it("should fail when non-creator tries to cancel without timeout", async () => {
      const roomId = getRoomId();
      const pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey],
        program
      );

      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 3)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      // Both join
      await joinRoom(program, player1, roomId);
      await joinRoom(program, player2, roomId);

      const player2StatePda = getPlayerStatePda(
        roomId,
        player2.publicKey,
        program
      );

      // player2 is not the creator and room hasn't timed out
      await expectAnchorError(
        program.methods
          .cancelRoom(roomId)
          .accounts({
            caller: player2.publicKey,
            //@ts-ignore
            room: pdas.room,
            playerState: player2StatePda,
            vault: pdas.vault,
            systemProgram: SYSTEM_PROGRAM,
          })
          .signers([player2])
          .rpc(),
        "RoomNotTimedOut"
      );
    });
  });

  describe("Pick Range Edge Cases", () => {
    let roomId: BN;
    let pdas: ReturnType<typeof buildAllPdas>;

    before(async () => {
      roomId = getRoomId();
      pdas = buildAllPdas(
        roomId,
        [player1.publicKey, player2.publicKey],
        program
      );

      await program.methods
        .createRoom(roomId, new BN(0.01 * LAMPORTS_PER_SOL), 2)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      await joinRoom(program, player1, roomId);
      await joinRoom(program, player2, roomId);

      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      await program.methods
        .startMatch(roomId)
        .accounts({
          authority: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
        })
        .rpc();
    });

    it("should allow pick=100 (max boundary)", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player1.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player1.publicKey,
        program
      );

      const tx = await program.methods
        .submitPick(roomId, 1, 100)
        .accounts({
          player: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
          playerRoundChoice: choicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      expect(tx).to.exist;
    });

    it("should allow pick=0 (min boundary)", async () => {
      const playerStatePda = getPlayerStatePda(
        roomId,
        player2.publicKey,
        program
      );
      const choicePda = getPlayerRoundChoicePda(
        roomId,
        player2.publicKey,
        program
      );

      const tx = await program.methods
        .submitPick(roomId, 1, 0)
        .accounts({
          player: player2.publicKey,
          //@ts-ignore
          room: pdas.room,
          playerState: playerStatePda,
          playerRoundChoice: choicePda,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([player2])
        .rpc();

      expect(tx).to.exist;
    });
  });
});
