// Debug script to test Borsh encoding of start_shuffle parameters
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import fs from 'fs';

const idl = JSON.parse(fs.readFileSync('src/idl/cerberus_poker.json', 'utf8'));

// Create a minimal provider
const connection = new Connection('https://api.devnet.solana.com');
const dummyWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
};
const provider = new AnchorProvider(connection, dummyWallet, {});
const programId = new PublicKey(idl.address);
const program = new Program(idl, provider);

// Simulate the encryption output
const deckCiphertext = Array.from({ length: 52 }, () => 
  Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))
);
const deckPubkey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
const deckNonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));

console.log('deckCiphertext length:', deckCiphertext.length);
console.log('deckCiphertext[0] length:', deckCiphertext[0].length);
console.log('deckCiphertext[0] sample:', deckCiphertext[0].slice(0, 5));
console.log('deckPubkey length:', deckPubkey.length);
console.log('deckNonce length:', deckNonce.length);
console.log('deckNonce:', deckNonce);

const gameId = new BN('732299976');
const computationOffset = new BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString());

try {
  // Try to build the instruction
  const ix = await program.methods
    .startShuffle(
      gameId,
      computationOffset,
      deckCiphertext,
      deckPubkey,
      deckNonce
    )
    .accounts({
      gameSession: Keypair.generate().publicKey,
      payer: dummyWallet.publicKey,
      signPdaAccount: Keypair.generate().publicKey,
      mxeAccount: Keypair.generate().publicKey,
      mempoolAccount: Keypair.generate().publicKey,
      executingPool: Keypair.generate().publicKey,
      computationAccount: Keypair.generate().publicKey,
      compDefAccount: Keypair.generate().publicKey,
      clusterAccount: Keypair.generate().publicKey,
      poolAccount: Keypair.generate().publicKey,
      clockAccount: Keypair.generate().publicKey,
      systemProgram: PublicKey.default,
      arciumProgram: Keypair.generate().publicKey,
    })
    .instruction();
  
  console.log('SUCCESS! Instruction built. Data length:', ix.data.length);
} catch (e) {
  console.error('FAILED:', e.message);
  console.error('Stack:', e.stack);
}
