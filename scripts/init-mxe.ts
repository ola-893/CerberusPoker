import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
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

const CERBERUS_POKER_PROGRAM_ID = new PublicKey('A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V');
const ARCIUM_PROGRAM_ID = new PublicKey('Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ');

function computeCompDefOffset(name: string): Buffer {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(Math.abs(hash));
  return buf;
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

  const program = new anchor.Program(idl, provider);

  const [mxeAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('mxe'), CERBERUS_POKER_PROGRAM_ID.toBuffer()],
    ARCIUM_PROGRAM_ID
  );

  console.log('MXE Account:', mxeAccount.toBase58());

  // Wait, looking at ARCIUM CLI, it initialized MXE, which means the MXE account should be funded and initialized.
  const mxeAccountInfo = await connection.getAccountInfo(mxeAccount);
  if (!mxeAccountInfo) {
    console.log('MXE Account is NOT initialized yet on Devnet!');
    return;
  } else {
    console.log('MXE Account IS initialized!');
  }

  const compDefs = [
    'shuffle_deck',
    'deal_card_to_recipient',
    'reveal_card',
    'reveal_community_card',
    'atomic_showdown'
  ];

  for (const defName of compDefs) {
    const compDefOffsetBuf = computeCompDefOffset(defName);
    const [compDefAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('comp_def'), compDefOffsetBuf],
      ARCIUM_PROGRAM_ID
    );

    console.log(`Checking comp def: ${defName} at ${compDefAccount.toBase58()}`);
    const info = await connection.getAccountInfo(compDefAccount);
    if (info) {
      console.log(`-> ${defName} is already initialized.`);
      continue;
    }

    console.log(`-> Initializing ${defName}...`);
    try {
      // Determine instruction name
      let methodName = '';
      if (defName === 'shuffle_deck') methodName = 'initShuffleDeckCompDef';
      else if (defName === 'deal_card_to_recipient') methodName = 'initDealCardCompDef';
      else if (defName === 'reveal_card') methodName = 'initRevealCardCompDef';
      else if (defName === 'reveal_community_card') methodName = 'initRevealCommunityCardCompDef';
      else if (defName === 'atomic_showdown') methodName = 'initAtomicShowdownCompDef';

      const tx = await program.methods[methodName]()
        .accounts({
          compDefAccount,
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
