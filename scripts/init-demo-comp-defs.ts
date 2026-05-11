import * as anchor from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CERBERUS_POKER_PROGRAM_ID = new PublicKey(
  process.env.CERBERUS_POKER_PROGRAM_ID ?? "4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG",
);
const ARCIUM_PROGRAM_ID = new PublicKey(
  process.env.ARCIUM_PROGRAM_ID ?? "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ",
);
const DEFAULT_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEFAULT_KEYPAIR = path.join(os.homedir(), ".config", "solana", "id.json");

const DEMO_COMP_DEFS = [
  { circuitName: "shuffle_deck_demo", methodName: "initShuffleDeckCompDef" },
  { circuitName: "atomic_showdown_demo", methodName: "initAtomicShowdownCompDef" },
] as const;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadKeypair(filePath: string): Keypair {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function asPublicKey(value: PublicKey | [PublicKey, number]): PublicKey {
  return Array.isArray(value) ? value[0] : value;
}

async function main() {
  const keypairPath = argValue("--keypair") ?? argValue("--keypair-path") ?? DEFAULT_KEYPAIR;
  const rpcUrl = argValue("--url") ?? argValue("--rpc-url") ?? DEFAULT_RPC_URL;
  const idlPath = path.resolve(process.cwd(), "packages", "programs", "target", "idl", "cerberus_poker.json");

  if (!fs.existsSync(idlPath)) {
    throw new Error(`Missing IDL: ${idlPath}. Run anchor build -p cerberus_poker first.`);
  }

  const wallet = new anchor.Wallet(loadKeypair(keypairPath));
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as anchor.Idl;
  const program = new anchor.Program(idl, CERBERUS_POKER_PROGRAM_ID, provider);

  const mxeAccount = asPublicKey(getMXEAccAddress(CERBERUS_POKER_PROGRAM_ID) as PublicKey | [PublicKey, number]);
  const addressLookupTable = asPublicKey(getLookupTableAddress(CERBERUS_POKER_PROGRAM_ID));

  console.log(`Program: ${CERBERUS_POKER_PROGRAM_ID.toBase58()}`);
  console.log(`Wallet:  ${wallet.publicKey.toBase58()}`);
  console.log(`RPC:     ${rpcUrl}`);

  for (const { circuitName, methodName } of DEMO_COMP_DEFS) {
    const offset = Buffer.from(getCompDefAccOffset(circuitName)).readUInt32LE(0);
    const compDefAccount = getCompDefAccAddress(CERBERUS_POKER_PROGRAM_ID, offset);
    const existing = await connection.getAccountInfo(compDefAccount);

    if (existing) {
      console.log(`${circuitName} already initialized: ${compDefAccount.toBase58()}`);
      continue;
    }

    console.log(`Initializing ${circuitName}: ${compDefAccount.toBase58()}`);

    const signature = await (program.methods as any)[methodName]()
      .accounts({
        compDefAccount,
        mxeAccount,
        addressLookupTable,
        lutProgram: AddressLookupTableProgram.programId,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        arciumProgram: ARCIUM_PROGRAM_ID,
      })
      .rpc();

    console.log(`${circuitName} initialized: ${signature}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
