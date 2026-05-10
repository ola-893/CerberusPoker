import { PublicKey } from '@solana/web3.js';
const cerberus = new PublicKey('4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG');
const arcium = new PublicKey('Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ');

const [mxe1] = PublicKey.findProgramAddressSync([Buffer.from('mxe'), cerberus.toBuffer()], arcium);
const [mxe2] = PublicKey.findProgramAddressSync([Buffer.from('mxe_account'), cerberus.toBuffer()], arcium);
const [mxe3] = PublicKey.findProgramAddressSync([Buffer.from('mxe'), cerberus.toBuffer()], cerberus);

console.log('mxe + arcium:', mxe1.toBase58());
console.log('mxe_account + arcium:', mxe2.toBase58());
console.log('mxe + cerberus:', mxe3.toBase58());
