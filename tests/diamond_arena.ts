import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DiamondArena } from "../target/types/diamond_arena";
import fs from "fs";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import {
  buildAllPdas,
  displayGameSummary,
  displayPlayerState,
  displayRoomState,
  displayRoundResults,
  expectAnchorError,
  finalizeRound,
  getPda,
  getPlayerLives,
  getRoomId,
  joinRoom,
  loadPlayer,
  logTransactionResult,
  Pdas,
  printState,
  submitPick,
  wait,
} from "./helper";
import { DEVNET_ASIA_VALIDATOR } from "./constants";
const TREASURY = new PublicKey("treynHHxg2ftG3Hzn5dypVZX593Yss6uU54puVE614D");
export const SYSTEM_PROGRAM = SystemProgram.programId;

describe("diamond_arena", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet as anchor.Wallet;

  const program = anchor.workspace.diamondArena as Program<DiamondArena>;

  let programDataAddress: PublicKey;

  // Setup players and game
  let player1: anchor.web3.Keypair;
  let player2: anchor.web3.Keypair;
  let player3: anchor.web3.Keypair;
  let roomId: BN;
  let pdas: Pdas;

  const entryFee = new BN(0.1 * LAMPORTS_PER_SOL);

  before(async () => {
    console.log("Setting up test...");
    console.log(`Admin: ${admin.publicKey}`);

    // Load players from files
    player1 = admin.payer;
    player2 = loadPlayer("");
    player3 = loadPlayer("");

    console.log(`Player1 (Admin): ${player1.publicKey}`);
    console.log(`Player2: ${player2.publicKey}`);
    console.log(`Player3: ${player3.publicKey}`);

    // Create room ID and all PDAs
    roomId = getRoomId();
    const playerList = [
      player1.publicKey,
      player2.publicKey,
      player3.publicKey,
    ];
    const roundsList = [1, 2, 3, 4];
    pdas = buildAllPdas(roomId, playerList, roundsList, program);

    console.log("Setup complete\n");
  });

  describe("Complete Game Flow", () => {
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
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      logTransactionResult("Room created", tx);
      expect(tx).to.exist;

      // Verify room state
      const roomAccount = await program.account.room.fetch(pdas.room);
      // console.log("room account:", roomAccount);
      expect(roomAccount.roomId.eq(roomId)).to.be.true;
      expect(roomAccount.entryFee.eq(entryFee)).to.be.true;
      // SHOW ROOM STATE after creation
      await displayRoomState(program, pdas.room, "ROOM CREATED");
    });

    it("should players join room", async () => {
      // Player 1 joins
      let tx = await joinRoom(program, player1, roomId, pdas);
      logTransactionResult("Player1 joined", tx);
      await displayPlayerState(
        program,
        pdas.playerStates[player1.publicKey.toBase58()],
        "Player1"
      );
      // Player 2 joins
      tx = await joinRoom(program, player2, roomId, pdas);
      logTransactionResult("Player2 joined", tx);
      await displayPlayerState(
        program,
        pdas.playerStates[player2.publicKey.toBase58()],
        "Player2"
      );

      // Player 3 joins
      tx = await joinRoom(program, player3, roomId, pdas);
      logTransactionResult("Player3 joined", tx);
      await displayPlayerState(
        program,
        pdas.playerStates[player3.publicKey.toBase58()],
        "Player3"
      );

      expect(tx).to.exist;
    });

    it("delegate the room pda to ER", async () => {
      const start = Date.now();
      const tx = await program.methods
        .delegateRoom(roomId)
        .accounts({
          payer: player1.publicKey,
          //@ts-ignore
          room: pdas.room,
          validator: DEVNET_ASIA_VALIDATOR,
        })
        .remainingAccounts([
          { pubkey: DEVNET_ASIA_VALIDATOR, isWritable: false, isSigner: false },
        ])
        .transaction();
      const txHash = await provider.sendAndConfirm(
        tx,
        [provider.wallet.payer],
        {
          skipPreflight: true,
          commitment: "confirmed",
        }
      );
      const duration = Date.now() - start;

      logTransactionResult(
        `${duration}ms (Base Layer) Delegate txHash`,
        txHash
      );
    });

    it("should start the match", async () => {
      const tx = await program.methods
        .startMatch(roomId)
        .accounts({
          authority: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
        })
        .rpc();

      logTransactionResult("Match started:", tx);
      // SHOW ROOM STATE after start
      await displayRoomState(program, pdas.room, "MATCH STARTED");
      expect(tx).to.exist;

      // Verify match is active
      const roomAccount = await program.account.room.fetch(pdas.room);
      expect(roomAccount.status.active).to.not.equal(undefined);
      expect(roomAccount.currentRound).to.equal(1);
      expect(roomAccount.commitDeadline.toNumber()).to.be.greaterThan(0);
      expect(roomAccount.revealDeadline.toNumber()).to.be.greaterThan(
        roomAccount.commitDeadline.toNumber()
      );
    });

    it("should do round 1 (picks: 20, 20, 40)", async () => {
      console.log("--- Round 1: P1=20, P2=20, P3=40 ---");

      // Submit picks
      const tx1 = await submitPick(program, player1, roomId, 1, 20, pdas);
      logTransactionResult(`P1 submitted pick 20`, tx1);

      const tx2 = await submitPick(program, player2, roomId, 1, 20, pdas);
      logTransactionResult(`P2 submitted pick 20`, tx2);

      const tx3 = await submitPick(program, player3, roomId, 1, 40, pdas);
      logTransactionResult(`P3 submitted pick 40`, tx3);

      // Wait for deadline
      await wait(20000);

      // Finish round
      const finalTx = await finalizeRound(
        program,
        player1,
        roomId,
        [player1, player2, player3],
        1,
        pdas
      );
      logTransactionResult(`Finalize Round`, finalTx);

      // SHOW DETAILED ROUND RESULTS from on-chain
      await displayRoundResults(
        program,
        1,
        [
          { name: "Player1", keypair: player1 },
          { name: "Player2", keypair: player2 },
          { name: "Player3", keypair: player3 },
        ],
        pdas
      );

      // Check lives
      const p1Lives = await getPlayerLives(
        program,
        pdas.playerStates[player1.publicKey.toBase58()]
      );
      const p2Lives = await getPlayerLives(
        program,
        pdas.playerStates[player2.publicKey.toBase58()]
      );
      const p3Lives = await getPlayerLives(
        program,
        pdas.playerStates[player3.publicKey.toBase58()]
      );

      // Check results
      expect(p1Lives).to.equal(3); // Winner
      expect(p2Lives).to.equal(1); // Collision (-2)
      expect(p3Lives).to.equal(2); // Loser (-1)
    });

    it("should do round 2 (picks: 50, 50, 30)", async () => {
      console.log("--- Round 2: P1=50, P2=50, P3=30 ---");

      // Submit picks
      const tx1 = await submitPick(program, player1, roomId, 2, 50, pdas);
      logTransactionResult(`P1 submitted pick 50`, tx1);

      const tx2 = await submitPick(program, player2, roomId, 2, 50, pdas);
      logTransactionResult(`P2 submitted pick 50`, tx2);

      const tx3 = await submitPick(program, player3, roomId, 2, 30, pdas);
      logTransactionResult(`P3 submitted pick 30`, tx3);

      // Wait for deadline
      await wait(20000);

      // Finish round
      const finalTx = await finalizeRound(
        program,
        player1,
        roomId,
        [player1, player2, player3],
        2,
        pdas
      );
      logTransactionResult(`Finalize Round`, finalTx);

      // SHOW DETAILED ROUND RESULTS
      await displayRoundResults(
        program,
        2,
        [
          { name: "Player1", keypair: player1 },
          { name: "Player2", keypair: player2 },
          { name: "Player3", keypair: player3 },
        ],
        pdas
      );

      // Check lives
      const p1Lives = await getPlayerLives(
        program,
        pdas.playerStates[player1.publicKey.toBase58()]
      );
      const p2Lives = await getPlayerLives(
        program,
        pdas.playerStates[player2.publicKey.toBase58()]
      );
      const p3Lives = await getPlayerLives(
        program,
        pdas.playerStates[player3.publicKey.toBase58()]
      );

      printState(2, [
        { name: "Player1", lives: p1Lives },
        { name: "Player2", lives: p2Lives },
        { name: "Player3", lives: p3Lives },
      ]);

      // Check results
      expect(p1Lives).to.equal(1); // collided with P2: 3 -> 1
      expect(p2Lives).to.equal(0); // collided with P1: 1 -> eliminated
      expect(p3Lives).to.equal(2); // winner, no life loss
    });

    it("should do round 3 (picks: 25, 45) - P2 out", async () => {
      console.log("--- Round 3: P1=25, P3=45 (P2 eliminated) ---");

      // Only P1 and P3 are alive
      const tx1 = await submitPick(program, player1, roomId, 3, 25, pdas);
      logTransactionResult(`P1 submitted pick 25`, tx1);

      const tx2 = await submitPick(program, player3, roomId, 3, 45, pdas);
      logTransactionResult(`P3 submitted pick 45`, tx2);

      // Wait for deadline
      await wait(20000);

      // Finish round with only active players
      const finalTx = await finalizeRound(
        program,
        player1,
        roomId,
        [player1, player3],
        3,
        pdas
      );
      logTransactionResult(`Finalize Round`, finalTx);

      // SHOW DETAILED ROUND RESULTS
      await displayRoundResults(
        program,
        3,
        [
          { name: "Player1", keypair: player1 },
          { name: "Player3", keypair: player3 },
        ],
        pdas
      );

      // Check lives
      const p1Lives = await getPlayerLives(
        program,
        pdas.playerStates[player1.publicKey.toBase58()]
      );
      const p3Lives = await getPlayerLives(
        program,
        pdas.playerStates[player3.publicKey.toBase58()]
      );

      printState(3, [
        { name: "Player1", lives: p1Lives },
        { name: "Player3", lives: p3Lives },
      ]);

      // Check results
      expect(p1Lives).to.equal(1); // winner, stays at 1
      expect(p3Lives).to.equal(1); // loser: 2 -> 1
    });

    it("should do round 4 (picks: 20, 60) - final round", async () => {
      console.log("--- Round 4: P1=20, P3=60 ---");

      // Only P1 and P3 are alive
      const tx1 = await submitPick(program, player1, roomId, 4, 20, pdas);
      logTransactionResult(`P1 submitted pick 20`, tx1);

      const tx2 = await submitPick(program, player3, roomId, 4, 60, pdas);
      logTransactionResult(`P3 submitted pick 60`, tx2);

      // Wait for deadline
      await wait(20000);

      // Finish round with only active players
      const finalTx = await finalizeRound(
        program,
        player1,
        roomId,
        [player1, player3],
        4,
        pdas
      );
      logTransactionResult(`Finalize Round`, finalTx);

      // SHOW DETAILED ROUND RESULTS
      await displayRoundResults(
        program,
        4,
        [
          { name: "Player1", keypair: player1 },
          { name: "Player3", keypair: player3 },
        ],
        pdas
      );

      // Check lives
      const p1Lives = await getPlayerLives(
        program,
        pdas.playerStates[player1.publicKey.toBase58()]
      );
      const p3Lives = await getPlayerLives(
        program,
        pdas.playerStates[player3.publicKey.toBase58()]
      );

      printState(4, [
        { name: "Player1", lives: p1Lives },
        { name: "Player3", lives: p3Lives },
      ]);

      // Check results
      expect(p1Lives).to.equal(1); // winner, stays alive
      expect(p3Lives).to.equal(0); // loser eliminated
    });

    it("should show final game summary", async () => {
      // SHOW FULL GAME SUMMARY
      await displayGameSummary(
        program,
        pdas.room,
        [
          { name: "Player1", keypair: player1 },
          { name: "Player2", keypair: player2 },
          { name: "Player3", keypair: player3 },
        ],
        pdas
      );

      // Verify winner
      const p1Status = await getPlayerLives(
        program,
        pdas.playerStates[player1.publicKey.toBase58()]
      );
      expect(p1Status).to.be.greaterThan(0);
    });
  });

  describe("Failure Path: Edge Cases and Errors", () => {
    it("should fail to join non-existent room", async () => {
      const failureRoomId = new BN(999);
      const failureRoomPda = getPda(
        [Buffer.from("room"), failureRoomId.toArrayLike(Buffer, "le", 8)],
        program
      );

      await expectAnchorError(
        program.methods
          .joinRoom(failureRoomId)
          .accounts({
            player: admin.publicKey,
            //@ts-ignore
            room: failureRoomPda,
            playerState: PublicKey.default,
            vault: PublicKey.default,
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "AccountNotInitialized"
      );

      console.log("Correctly rejected non-existent room\n");
    });

    it("should fail to create room with 0 max players", async () => {
      const testRoomId = getRoomId();

      await expectAnchorError(
        program.methods
          .createRoom(testRoomId, entryFee, 0) // 0 max players - invalid
          .accounts({
            creator: admin.publicKey,
            //@ts-ignore
            room: getPda(
              [Buffer.from("room"), testRoomId.toArrayLike(Buffer, "le", 8)],
              program
            ),
            vault: getPda(
              [Buffer.from("vault"), testRoomId.toArrayLike(Buffer, "le", 8)],
              program
            ),
            systemProgram: SYSTEM_PROGRAM,
          })
          .rpc(),
        "InvalidMaxPlayers"
      );

      console.log("Correctly rejected invalid max players\n");
    });

    it("should fail to join when room is full", async () => {
      const testRoomId = getRoomId();
      const testPdas = buildAllPdas(
        testRoomId,
        [player1.publicKey, player2.publicKey, player3.publicKey],
        [1],
        program
      );

      // Create room with max 2 players
      await program.methods
        .createRoom(testRoomId, entryFee, 2)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: testPdas.room,
          vault: testPdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      // Join 2 players
      await joinRoom(program, player1, testRoomId, testPdas);
      await joinRoom(program, player2, testRoomId, testPdas);

      // Try to join 3rd player - should fail
      await expectAnchorError(
        program.methods
          .joinRoom(testRoomId)
          .accounts({
            player: player3.publicKey,
            //@ts-ignore
            room: testPdas.room,
            playerState: testPdas.playerStates[player3.publicKey.toBase58()],
            vault: testPdas.vault,
            systemProgram: SYSTEM_PROGRAM,
          })
          .signers([player3])
          .rpc(),
        "RoomFull"
      );

      console.log("Correctly rejected join on full room\n");
    });

    it("should fail to start match with insufficient players", async () => {
      const testRoomId = getRoomId();
      const testPdas = buildAllPdas(
        testRoomId,
        [player1.publicKey],
        [1],
        program
      );

      await program.methods
        .createRoom(testRoomId, entryFee, 3)
        .accounts({
          creator: admin.publicKey,
          //@ts-ignore
          room: testPdas.room,
          vault: testPdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      // Only 1 player joins
      await joinRoom(program, player1, testRoomId, testPdas);

      // Try to start match - should fail
      await expectAnchorError(
        program.methods
          .startMatch(testRoomId)
          .accounts({
            authority: admin.publicKey,
            //@ts-ignore
            room: testPdas.room,
          })
          .rpc(),
        "NotEnoughPlayers"
      );

      console.log("Correctly rejected match start with insufficient players\n");
    });
  });
});
