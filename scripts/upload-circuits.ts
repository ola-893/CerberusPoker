/**
 * Upload circuit data and finalize computation definitions.
 *
 * The comp-defs were initialized (init_comp_def) but never had their circuit
 * data uploaded or finalized.  Arcium's on-chain check
 * `ComputationDefinitionNotCompleted` fires when someone tries to queue a
 * computation against an un-finalized comp-def.
 *
 * This script:
 *   1. Reads each compiled `.arcis` circuit file from mxe/build/
 *   2. Calls `uploadCircuit()` from @arcium-hq/client which:
 *      a. Creates raw-circuit accounts and uploads data in chunks
 *      b. Calls `finalizeComputationDefinition` to mark it complete
 *
 * IMPORTANT: The signer must be the uploadAuth for the demo comp-defs.
 * That is normally the same wallet that ran scripts/init-mxe.ts.
 *
 * Usage:
 *   npx ts-node scripts/upload-circuits.ts [--keypair /path/to/authority.json]
 *
 * If --keypair is omitted, it defaults to ~/.config/solana/id.json
 */

import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  getArciumProgram,
  getCompDefAccAddress,
  getCompDefAccOffset,
  uploadCircuit,
} from '@arcium-hq/client';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const CERBERUS_POKER_PROGRAM_ID = new PublicKey(
  'CMtyqKPtwG3Eyfwg36cZXycNsdHBXANW6ZHY5SWVa6ye'
);

const RPC_URL = 'https://api.devnet.solana.com';

/** Map of demo comp-def name → .arcis file path (relative to repo root) */
const CIRCUITS: Record<string, string> = {
  shuffle_deck_v3: 'mxe/build/shuffle_deck_v3.arcis',
};
const CHUNK_SIZE = Number(process.env.ARCIUM_UPLOAD_CHUNK_SIZE ?? '20');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function compDefOffset(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE(0);
}

function parseArgs(): { keypairPath: string } {
  const args = process.argv.slice(2);
  let keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keypair' && args[i + 1]) {
      keypairPath = args[i + 1];
      i++;
    }
  }

  return { keypairPath };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { keypairPath } = parseArgs();
  const repoRoot = path.resolve(__dirname, '..');

  console.log('=== Arcium Circuit Upload & Finalize ===');
  console.log(`RPC:     ${RPC_URL}`);
  console.log(`Keypair: ${keypairPath}`);
  console.log(`Program: ${CERBERUS_POKER_PROGRAM_ID.toBase58()}`);
  console.log();

  // Load keypair
  if (!fs.existsSync(keypairPath)) {
    console.error(`Keypair file not found: ${keypairPath}`);
    process.exit(1);
  }
  const secretKey = new Uint8Array(
    JSON.parse(fs.readFileSync(keypairPath, 'utf8'))
  );
  const wallet = Keypair.fromSecretKey(secretKey);
  console.log(`Signer:  ${wallet.publicKey.toBase58()}`);
  console.log();

  // Set up Anchor provider
  const connection = new Connection(RPC_URL, 'confirmed');
  const providerWallet = new anchor.Wallet(wallet);
  const provider = new anchor.AnchorProvider(connection, providerWallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const arciumProgram = getArciumProgram(provider);

  // Check each comp-def and upload if needed
  for (const [circuitName, arcisPath] of Object.entries(CIRCUITS)) {
    const offset = compDefOffset(circuitName);
    const compDefAddr = getCompDefAccAddress(CERBERUS_POKER_PROGRAM_ID, offset);

    console.log(`── ${circuitName} ──`);
    console.log(`   CompDef: ${compDefAddr.toBase58()}`);
    console.log(`   Offset:  ${offset}`);

    // Check current state
    try {
      const compDefAcc =
        await arciumProgram.account.computationDefinitionAccount.fetch(
          compDefAddr
        );

      const circuitSource = compDefAcc.circuitSource as any;
      if (circuitSource?.onChain?.[0]?.isCompleted) {
        console.log(`   ✅ Already finalized — skipping`);
        console.log();
        continue;
      }

      // Check upload authority
      const uploadAuth = circuitSource?.onChain?.[0]?.uploadAuth;
      if (uploadAuth) {
        const authStr =
          uploadAuth instanceof PublicKey
            ? uploadAuth.toBase58()
            : new PublicKey(uploadAuth).toBase58();

        if (authStr !== wallet.publicKey.toBase58()) {
          console.error(
            `   ❌ Upload authority mismatch!\n` +
              `      Expected signer: ${authStr}\n` +
              `      Current signer:  ${wallet.publicKey.toBase58()}\n` +
              `      You must use the keypair for ${authStr}`
          );
          console.log();
          continue;
        }
      }
    } catch (err: any) {
      console.error(`   ❌ Failed to fetch comp-def: ${err.message}`);
      console.log();
      continue;
    }

    // Load circuit file
    const fullPath = path.resolve(repoRoot, arcisPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`   ❌ Circuit file not found: ${fullPath}`);
      console.log();
      continue;
    }

    const rawCircuit = new Uint8Array(fs.readFileSync(fullPath));
    console.log(`   Circuit size: ${(rawCircuit.length / 1024).toFixed(1)} KB`);
    console.log(`   Uploading & finalizing...`);

    try {
      const sigs = await uploadCircuit(
        provider,
        circuitName,
        CERBERUS_POKER_PROGRAM_ID,
        rawCircuit,
        true, // logging
        CHUNK_SIZE, // chunkSize
        { commitment: 'confirmed' }
      );
      console.log(`   ✅ Done! ${sigs.length} transaction(s)`);
      if (sigs.length > 0) {
        console.log(`   Last sig: ${sigs[sigs.length - 1]}`);
      }
    } catch (err: any) {
      console.error(`   ❌ Upload failed: ${err.message}`);
    }

    console.log();
  }

  // Final verification
  console.log('=== Verification ===');
  for (const circuitName of Object.keys(CIRCUITS)) {
    const offset = compDefOffset(circuitName);
    const compDefAddr = getCompDefAccAddress(CERBERUS_POKER_PROGRAM_ID, offset);
    try {
      const acc =
        await arciumProgram.account.computationDefinitionAccount.fetch(
          compDefAddr
        );
      const source = acc.circuitSource as any;
      const completed = source?.onChain?.[0]?.isCompleted ?? false;
      console.log(
        `  ${completed ? '✅' : '❌'} ${circuitName}: isCompleted=${completed}`
      );
    } catch {
      console.log(`  ❌ ${circuitName}: could not fetch`);
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
