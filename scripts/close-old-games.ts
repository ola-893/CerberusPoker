#!/usr/bin/env ts-node
/**
 * Close old game accounts that are incompatible with the current program version
 * 
 * Usage: ts-node scripts/close-old-games.ts
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const CERBERUS_POKER_PROGRAM_ID = 'CMtyqKPtwG3Eyfwg36cZXycNsdHBXANW6ZHY5SWVa6ye';

async function main() {
  // Load wallet from default Solana CLI location
  const walletPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  console.log('Wallet:', wallet.publicKey.toString());
  console.log('Program:', CERBERUS_POKER_PROGRAM_ID);
  console.log('\nSearching for game accounts...\n');

  // Load the IDL
  const idlPath = path.join(__dirname, '../packages/programs/target/idl/cerberus_poker.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl, CERBERUS_POKER_PROGRAM_ID, provider);

  try {
    // Fetch all game accounts
    const games = await program.account.gameSession.all();
    
    if (games.length === 0) {
      console.log('No game accounts found.');
      return;
    }

    console.log(`Found ${games.length} game account(s):\n`);
    
    for (const game of games) {
      console.log(`Game PDA: ${game.publicKey.toString()}`);
      console.log(`  Game ID: ${game.account.gameId.toString()}`);
      console.log(`  State: ${Object.keys(game.account.state)[0]}`);
      console.log(`  Players: ${game.account.numPlayers}/${game.account.maxPlayers}`);
      console.log('');
    }

    console.log('\nTo close these accounts, you need to:');
    console.log('1. Add a close_game instruction to the program');
    console.log('2. Or wait for them to expire (if rent-exempt)');
    console.log('3. Or create new games with different game IDs\n');
    console.log('For now, just create a NEW game with a different game ID.');

  } catch (error: any) {
    console.error('Error fetching games:', error.message);
    console.log('\nThis is expected if old accounts are incompatible.');
    console.log('Solution: Create a new game with a fresh game ID.');
  }
}

main().catch(console.error);
