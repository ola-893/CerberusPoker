import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection('https://api.devnet.solana.com', 'confirmed');
async function run() {
  const tx = await c.getTransaction('VrN9KSebVcfH17S78zX4R25MtShzLUz2w7ZGcXk41o39pbaK9NeCVYacGBeTagk1nbTBvTNC7zN56JRLfFQ5ULV', {maxSupportedTransactionVersion: 0});
  console.log(tx.transaction.message.accountKeys.map(k => k.toString()));
}
run();
