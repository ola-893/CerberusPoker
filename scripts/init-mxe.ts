import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  getArciumProgram,
  getArciumProgramId,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
} from '@arcium-hq/client';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Load IDL
const idl = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../packages/programs/target/idl/cerberus_poker.json'),
    'utf8'
  )
);

const CERBERUS_POKER_PROGRAM_ID = new PublicKey('4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG');
const ARCIUM_PROGRAM_ID = getArciumProgramId();

function compDefOffset(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE(0);
}

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
  const wallet = Keypair.fromSecretKey(secretKey);
  const providerWallet = new anchor.Wallet(wallet);

  const provider = new anchor.AnchorProvider(connection, providerWallet, {
    commitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, provider) as any;

  const arciumProgram = getArciumProgram(provider);
  const mxeAccount = getMXEAccAddress(CERBERUS_POKER_PROGRAM_ID);

  console.log('MXE Account:', mxeAccount.toBase58());

  // Wait, looking at ARCIUM CLI, it initialized MXE, which means the MXE account should be funded and initialized.
  const mxeAccountInfo = await connection.getAccountInfo(mxeAccount);
  if (!mxeAccountInfo) {
    console.log('MXE Account is NOT initialized yet on Devnet!');
    return;
  } else {
    console.log('MXE Account IS initialized!');
  }

  const mxe = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
  const lutOffset = mxe.lutOffsetSlot;
  if (!lutOffset) {
    throw new Error('Unable to read MXE LUT offset slot');
  }
  const addressLookupTable = getLookupTableAddress(CERBERUS_POKER_PROGRAM_ID, lutOffset);

  const compDefs = [
    { defName: 'shuffle_deck_demo', methodName: 'initShuffleDeckCompDef' },
    { defName: 'deal_card_to_recipient', methodName: 'initDealCardCompDef' },
    { defName: 'reveal_card', methodName: 'initRevealCardCompDef' },
    { defName: 'reveal_community_card', methodName: 'initRevealCommunityCardCompDef' },
    { defName: 'atomic_showdown_demo', methodName: 'initAtomicShowdownCompDef' },
  ];

  for (const { defName, methodName } of compDefs) {
    const offset = compDefOffset(defName);
    const compDefAccount = getCompDefAccAddress(CERBERUS_POKER_PROGRAM_ID, offset);

    console.log(`Checking comp def: ${defName} at ${compDefAccount.toBase58()}`);
    const info = await connection.getAccountInfo(compDefAccount);
    if (info) {
      console.log(`-> ${defName} is already initialized.`);
      continue;
    }

    console.log(`-> Initializing ${defName}...`);
    try {
      const tx = await program.methods[methodName]()
        .accounts({
          compDefAccount,
          addressLookupTable,
          lutProgram: AddressLookupTableProgram.programId,
          mxeAccount,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          arciumProgram: ARCIUM_PROGRAM_ID,
        })
        .rpc();

      console.log(`-> ${defName} initialized! Tx: ${tx}`);
    } catch (err: any) {
      console.error(`-> Failed to initialize ${defName}:`, err.message);
      // Wait for 1 second before continuing just in case
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log('Done!');
}

main().catch(console.error);
