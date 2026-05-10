import { PublicKey } from '@solana/web3.js';
const arcium = new PublicKey('Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ');
const p = new PublicKey('A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V');
const [pda] = PublicKey.findProgramAddressSync([Buffer.from('mxe'), p.toBuffer()], arcium);
console.log('MXE for A6ce:', pda.toBase58());
