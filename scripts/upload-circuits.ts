import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { uploadCircuit } from "@arcium-hq/client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CERBERUS_POKER_PROGRAM_ID = new PublicKey(
  process.env.CERBERUS_POKER_PROGRAM_ID ?? "4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG",
);

const DEFAULT_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEFAULT_KEYPAIR = path.join(os.homedir(), ".config", "solana", "id.json");
const CHUNK_SIZE = Number(process.env.ARCIUM_UPLOAD_CHUNK_SIZE ?? "20");

const CIRCUITS = [
  "atomic_showdown_demo",
  "shuffle_deck_demo",
] as const;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadKeypair(filePath: string): Keypair {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const keypairPath = argValue("--keypair") ?? argValue("--keypair-path") ?? DEFAULT_KEYPAIR;
  const rpcUrl = argValue("--url") ?? argValue("--rpc-url") ?? DEFAULT_RPC_URL;
  const only = argValue("--only");
  const circuits = only
    ? only.split(",").map((name) => name.trim()).filter(Boolean)
    : [...CIRCUITS];
  const circuitsDir = path.resolve(process.cwd(), "mxe", "build");

  const wallet = new anchor.Wallet(loadKeypair(keypairPath));
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  anchor.setProvider(provider);

  console.log(`Program: ${CERBERUS_POKER_PROGRAM_ID.toBase58()}`);
  console.log(`Wallet:  ${wallet.publicKey.toBase58()}`);
  console.log(`RPC:     ${rpcUrl}`);
  console.log(`Build:   ${circuitsDir}`);
  console.log(`Parallel uploads: ${CHUNK_SIZE}`);

  for (const circuitName of circuits) {
    const circuitPath = path.join(circuitsDir, `${circuitName}.arcis`);
    if (!fs.existsSync(circuitPath)) {
      throw new Error(`Missing circuit file: ${circuitPath}. Run arcium build from the mxe directory first.`);
    }

    const rawCircuit = fs.readFileSync(circuitPath);
    console.log(`\nUploading ${circuitName} (${rawCircuit.length.toLocaleString()} bytes)`);

    await uploadCircuit(
      provider,
      circuitName,
      CERBERUS_POKER_PROGRAM_ID,
      rawCircuit,
      true,
      CHUNK_SIZE,
      { commitment: "confirmed", preflightCommitment: "confirmed" },
    );

    console.log(`Finalized ${circuitName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
