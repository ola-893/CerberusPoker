import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection('https://api.devnet.solana.com', 'confirmed');
async function check(addr) {
  const info = await c.getAccountInfo(new PublicKey(addr));
  console.log(addr, info ? "EXISTS" : "null");
}
check('F8e8ZFshicH4dCqYsR1VacAxyfwBDLeAPr2BfnvCKxug');
check('4Gjz7gkNQSVMHfChsdfQeQGnfp8kpTmeNrDWpD91BWvr');
check('2tpuK9b1PrGwwQo4nT6sniukUMh1Ui4ngNzS6h4rq8EQ');
