import { PublicKey } from '@solana/web3.js';
const arcium = new PublicKey('Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ');
const p = new PublicKey('4YM3v1wkxaQ4sPZ8BxTGpKK6Lu6znvC8bfP6Pa73eoh9');
const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from('mxe'), p.toBuffer()], arcium);
console.log('mxe:', pda.toBase58());
