import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DiamondArena } from "../target/types/diamond_arena";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import {
  buildAllPdas,
  delegatePlayerRoundChoice,
  delegatePlayerStates,
  displayPlayerState,
  displayRoomState,
  getPda,
  getPlayerRoundChoicePda,
  getPlayerStateFromER,
  getRoomFromER,
  getRoomId,
  joinRoom,
  loadPlayer,
  logTx,
  printState,
  randomPick,
  RoundPlayer,
  runRound,
  startMatchViaMagicRouter,
} from "./helper";
import { CONFIG_SEED, DEVNET_ASIA_VALIDATOR, erProvider } from "./constants";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
const TREASURY = new PublicKey("treynHHxg2ftG3Hzn5dypVZX593Yss6uU54puVE614D");
export const SYSTEM_PROGRAM = SystemProgram.programId;
let gameOver = false;

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
  let pdas;
  let configPda: PublicKey;
  const entryFee = new BN(0.1 * LAMPORTS_PER_SOL);

  let allPlayers: RoundPlayer[];
  let activePlayers: RoundPlayer[];
  let pointsMap: Map<string, number>;

  before(async () => {
    console.log("\n   Diamond Arena - Test Setup");

    [programDataAddress] = PublicKey.findProgramAddressSync(
      [program.programId.toBytes()],
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    );

    player1 = admin.payer;
    player2 = loadPlayer(
      "/Users/mut0xE/Downloads/keys/us68r6awy9CVvUkJ58jEY1Bxp4sjpuyQZZys41hNH9S.json"
    );
    player3 = loadPlayer(
      "/Users/mut0xE/Downloads/keys/b2M6wZCujvcaKms27aLnsfNhhM5LLdygutwqJb9Uzn2.json"
    );

    allPlayers = [
      { name: "Player1", keypair: player1, pick: 0 },
      { name: "Player2", keypair: player2, pick: 0 },
      { name: "Player3", keypair: player3, pick: 0 },
    ];

    console.log(`   Player1: ${player1.publicKey.toBase58().slice(0, 12)}...`);
    console.log(`   Player2: ${player2.publicKey.toBase58().slice(0, 12)}...`);
    console.log(`   Player3: ${player3.publicKey.toBase58().slice(0, 12)}...`);

    configPda = getPda([CONFIG_SEED], program);

    roomId = getRoomId();
    const playerList = [
      player1.publicKey,
      player2.publicKey,
      player3.publicKey,
    ];
    pdas = buildAllPdas(roomId, playerList, program);
  });

  describe("Complete Game Flow", () => {
    it("should initialize config", async () => {
      // Check if config already exists (from previous test run)
      try {
        const existing = await program.account.config.fetch(configPda);
        if (existing) {
          console.log("   Config already exists, skipping initialization");
          expect(existing.feeBps).equals(100);
          return;
        }
      } catch {
        // Config doesn't exist, create it
      }

      const programData = programDataAddress;

      const tx = await program.methods
        .initializeConfig(TREASURY, 100) // 1%
        .accounts({
          admin: admin.publicKey,
          //@ts-ignore
          config: configPda,
          systemProgram: SYSTEM_PROGRAM,
          thisProgram: program.programId,
          programData,
        })
        .rpc();

      logTx("Config initialized", tx);
      expect(tx).to.exist;

      const configAccount = await program.account.config.fetch(configPda);
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
          room: pdas.room,
          vault: pdas.vault,
          systemProgram: SYSTEM_PROGRAM,
        })
        .rpc();

      logTx("Room created", tx, "L1");
      expect(tx).to.exist;

      // Verify room state
      const roomAccount = await program.account.room.fetch(pdas.room);
      expect(roomAccount.roomId.eq(roomId)).to.be.true;
      expect(roomAccount.entryFee.eq(entryFee)).to.be.true;
      await displayRoomState(program, pdas.room, "ROOM CREATED");
    });

    it("should players join room", async () => {
      for (const p of allPlayers) {
        const tx = await joinRoom(program, p.keypair, roomId);
        logTx(`${p.name} joined`, tx, "L1");
        await displayPlayerState(
          program,
          pdas.playerStates[p.keypair.publicKey.toBase58()],
          p.name
        );
      }
    });

    it("delegate the room PDA to ER", async () => {
      const start = Date.now();
      const tx = await program.methods
        .delegateInput({ room: { roomId } })
        .accounts({
          payer: player1.publicKey,
          pda: pdas.room,
          //@ts-ignore
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

      logTx(`Room delegated to ER (${Date.now() - start}ms)`, txHash, "L1");
    });

    it("should delegate all player state PDAs", async () => {
      const playerArgs = [
        {
          pub: admin.publicKey,
          pda: pdas.playerStates[player1.publicKey.toBase58()],
        },
        {
          pub: player2.publicKey,
          pda: pdas.playerStates[player2.publicKey.toBase58()],
        },
        {
          pub: player3.publicKey,
          pda: pdas.playerStates[player3.publicKey.toBase58()],
        },
      ];

      for (let i = 0; i < playerArgs.length; i++) {
        const { pub, pda } = playerArgs[i];
        const tx = await delegatePlayerStates(
          program,
          admin.payer,
          roomId,
          pub,
          pda
        );
        logTx(`Player${i + 1} state delegated`, tx, "L1");
      }
    });

    it("should start match via Magic Router", async () => {
      const sig = await startMatchViaMagicRouter(
        program,
        admin.payer,
        roomId,
        pdas.room
      );
      logTx("Match started", sig, "ER");
    });

    it("should delegate all player choice PDAs", async () => {
      for (let i = 0; i < allPlayers.length; i++) {
        const p = allPlayers[i];
        const choice = getPlayerRoundChoicePda(
          roomId,
          p.keypair.publicKey,
          program
        );
        const tx = await delegatePlayerRoundChoice(
          program,
          admin.payer,
          roomId,
          p.keypair.publicKey,
          choice
        );
        logTx(`${p.name} choice PDA delegated`, tx, "L1");
      }
    });

    for (let roundNum = 1; roundNum <= 25; roundNum++) {
      it(`should do round ${roundNum}`, async () => {
        // skip all remaining rounds once game is decided
        if (gameOver) {
          console.log(
            `\n  Round ${roundNum} skipped -- game already finished.\n`
          );
          return;
        }

        // rebuild activePlayers from previous pointsMap
        if (roundNum === 1) {
          activePlayers = [...allPlayers];
        } else {
          activePlayers = allPlayers.filter(
            (p) => (pointsMap?.get(p.keypair.publicKey.toBase58()) ?? 0) > -10
          );
        }

        // skip if only 1 alive before round starts
        if (activePlayers.length <= 1) {
          console.log(
            `\n  Round ${roundNum} skipped -- game already finished.\n`
          );
          gameOver = true;
          return;
        }

        // Random picks each round - real game simulation
        const playersWithPicks: RoundPlayer[] = activePlayers.map((p) => ({
          ...p,
          pick: randomPick(0, 100, 1),
        }));

        // run on ER, get back updated pointsMap
        pointsMap = await runRound(
          program,
          admin.payer,
          roomId,
          roundNum,
          playersWithPicks,
          allPlayers,
          pdas
        );

        // print snapshot (all players shown)
        printState(
          roundNum,
          allPlayers.map((p) => ({
            name: p.name,
            minusPoints: pointsMap.get(p.keypair.publicKey.toBase58()) ?? 0,
          }))
        );

        // check if game is now over
        const stillAlive = [...pointsMap.values()].filter(
          (mp) => mp > -10
        ).length;
        if (stillAlive <= 1) {
          const winner = allPlayers.find(
            (p) => (pointsMap.get(p.keypair.publicKey.toBase58()) ?? 0) > -10
          );
          console.log(
            `\n  🏆 ${
              winner?.name ?? "Unknown"
            } wins after round ${roundNum}! 🏆\n`
          );
          gameOver = true;
        }
      });
    }

    it("should show final winner", async () => {
      if (!gameOver) {
        console.log("   Game did not finish within max rounds — skipping");
        return;
      }

      const roomEr = await getRoomFromER(
        erProvider.connection,
        program,
        pdas.room
      );

      const states = await Promise.all(
        allPlayers.map((p) =>
          getPlayerStateFromER(
            erProvider.connection,
            program,
            pdas.playerStates[p.keypair.publicKey.toBase58()]
          )
        )
      );

      printState(
        "FINAL — Ephemeral Rollup",
        allPlayers.map((p, i) => ({
          name: p.name,
          minusPoints: states[i]?.minusPoints ?? 0,
        }))
      );

      expect(roomEr.status.finished).to.not.equal(undefined);

      const winner = allPlayers.find(
        (p) => (pointsMap?.get(p.keypair.publicKey.toBase58()) ?? 0) > -10
      );
      expect(roomEr.winner.toBase58()).to.equal(
        winner!.keypair.publicKey.toBase58()
      );
    });

    // Commits state and undelegates accounts back to L1 in one step.
    // After this, accounts are fully owned by Solana L1 again.
    it("should commit+undelegate room + player states back to Solana", async () => {
      if (!gameOver) {
        console.log("   Game did not finish -- skipping undelegate");
        return;
      }
      const remainingAccounts = allPlayers.map((p) => ({
        pubkey: pdas.playerStates[p.keypair.publicKey.toBase58()],
        isWritable: true,
        isSigner: false,
      }));

      const erStart = Date.now();

      let tx = await program.methods
        .undelegate(roomId)
        .accounts({
          payer: admin.publicKey,
          // @ts-ignore
          room: pdas.room,
        })
        .remainingAccounts(remainingAccounts)
        .transaction();

      tx.feePayer = admin.publicKey;
      tx.recentBlockhash = (
        await erProvider.connection.getLatestBlockhash()
      ).blockhash;
      tx = await erProvider.wallet.signTransaction(tx);

      const txHash = await erProvider.sendAndConfirm(tx, [], {
        skipPreflight: true,
      });
      logTx(`Undelegate sent (${Date.now() - erStart}ms)`, txHash, "ER");

      const l1Start = Date.now();
      const txCommitSgn = await GetCommitmentSignature(
        txHash,
        erProvider.connection
      );
      logTx(
        `State committed+undelegated to L1 (${Date.now() - l1Start}ms)`,
        txCommitSgn,
        "L1"
      );

      const roomL1 = await program.account.room.fetch(pdas.room);
      const states = await Promise.all(
        allPlayers.map((p) =>
          program.account.playerState.fetch(
            pdas.playerStates[p.keypair.publicKey.toBase58()]
          )
        )
      );

      printState(
        "L1 after undelegate",
        allPlayers.map((p, i) => ({
          name: p.name,
          minusPoints: states[i].minusPoints,
        }))
      );

      expect(roomL1.status.finished).to.not.equal(undefined);

      const winner = allPlayers.find(
        (p) => (pointsMap?.get(p.keypair.publicKey.toBase58()) ?? 0) > -10
      );
      expect(roomL1.winner.toBase58()).to.equal(
        winner!.keypair.publicKey.toBase58()
      );
    });

    it("should settle match and pay winner on Solana", async () => {
      if (!gameOver) {
        console.log("   Game did not finish -- skipping settle");
        return;
      }
      const vaultBefore = await provider.connection.getBalance(pdas.vault);
      const configAccount = await program.account.config.fetch(configPda);
      const fee = Math.floor((vaultBefore * configAccount.feeBps) / 10_000);
      const payout = vaultBefore - fee;

      const winner = allPlayers.find(
        (p) => (pointsMap?.get(p.keypair.publicKey.toBase58()) ?? 0) > -10
      );

      const sig = await program.methods
        .settleMatch(roomId)
        .accounts({
          caller: admin.publicKey,
          //@ts-ignore
          room: pdas.room,
          vault: pdas.vault,
          winner: winner!.keypair.publicKey,
          config: configPda,
          treasury: TREASURY,
          systemProgram: SYSTEM_PROGRAM,
        })
        .signers([admin.payer])
        .rpc();

      logTx(
        `Settled: ${winner!.name} gets ${(payout / 1e9).toFixed(
          4
        )} SOL (fee: ${(fee / 1e9).toFixed(4)})`,
        sig,
        "L1"
      );
    });
  });
});
