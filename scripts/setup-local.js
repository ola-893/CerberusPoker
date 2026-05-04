#!/usr/bin/env node

/**
 * CerberusPoker Local Setup Script
 * 
 * This script automates the local development setup:
 * 1. Checks prerequisites
 * 2. Configures Solana for localnet
 * 3. Creates/funds wallet
 * 4. Builds and deploys programs
 * 5. Updates program IDs in config files
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return null;
  }
}

function checkCommand(command, name) {
  try {
    exec(`${command} --version`, { silent: true });
    log(`✅ ${name} is installed`, 'green');
    return true;
  } catch {
    log(`❌ ${name} is not installed`, 'red');
    return false;
  }
}

async function main() {
  log('\n🎴 CerberusPoker Local Setup\n', 'cyan');

  // Step 1: Check prerequisites
  log('📋 Checking prerequisites...', 'blue');
  const checks = {
    'solana': checkCommand('solana', 'Solana CLI'),
    'anchor': checkCommand('anchor', 'Anchor CLI'),
    'node': checkCommand('node', 'Node.js'),
  };

  if (!Object.values(checks).every(Boolean)) {
    log('\n❌ Missing prerequisites. Please install them first:', 'red');
    log('   See SETUP.md for installation instructions', 'yellow');
    process.exit(1);
  }

  // Step 2: Configure Solana for localnet
  log('\n⚙️  Configuring Solana for localnet...', 'blue');
  exec('solana config set --url localhost');

  // Step 3: Check/create wallet
  log('\n💰 Checking wallet...', 'blue');
  const walletPath = path.join(process.env.HOME, '.config', 'solana', 'id.json');
  
  if (!fs.existsSync(walletPath)) {
    log('Creating new wallet...', 'yellow');
    exec(`solana-keygen new --outfile ${walletPath} --no-bip39-passphrase`);
  } else {
    log('✅ Wallet already exists', 'green');
  }

  // Step 4: Check if validator is running
  log('\n🔍 Checking if validator is running...', 'blue');
  try {
    exec('solana cluster-version', { silent: true });
    log('✅ Validator is running', 'green');
  } catch {
    log('❌ Validator is not running', 'red');
    log('\n📝 To start the validator, run in a separate terminal:', 'yellow');
    log('   solana-test-validator', 'cyan');
    log('\nThen run this script again.', 'yellow');
    process.exit(1);
  }

  // Step 5: Fund wallet
  log('\n💸 Funding wallet...', 'blue');
  try {
    exec('solana airdrop 10');
    const balance = exec('solana balance', { silent: true }).trim();
    log(`✅ Wallet balance: ${balance}`, 'green');
  } catch (error) {
    log('⚠️  Could not airdrop SOL (validator might not be ready)', 'yellow');
  }

  // Step 6: Build programs
  log('\n🔨 Building Solana programs...', 'blue');
  exec('cd packages/programs && anchor build');
  log('✅ Programs built successfully', 'green');

  // Step 7: Deploy programs
  log('\n🚀 Deploying programs to localnet...', 'blue');
  const deployOutput = exec('cd packages/programs && anchor deploy', { silent: true });
  
  // Extract program IDs from deploy output
  const programIds = {};
  const lines = deployOutput.split('\n');
  for (const line of lines) {
    if (line.includes('Program Id:')) {
      const match = line.match(/Program Id: ([A-Za-z0-9]+)/);
      if (match) {
        const programId = match[1];
        if (line.includes('cerberus_poker')) {
          programIds.cerberus_poker = programId;
        } else if (line.includes('texas_holdem')) {
          programIds.texas_holdem = programId;
        }
      }
    }
  }

  if (programIds.cerberus_poker && programIds.texas_holdem) {
    log('✅ Programs deployed successfully', 'green');
    log(`   cerberus_poker: ${programIds.cerberus_poker}`, 'cyan');
    log(`   texas_holdem: ${programIds.texas_holdem}`, 'cyan');

    // Step 8: Update program IDs in config files
    log('\n📝 Updating program IDs in config files...', 'blue');
    
    // Update Anchor.toml
    const anchorTomlPath = path.join('packages', 'programs', 'Anchor.toml');
    let anchorToml = fs.readFileSync(anchorTomlPath, 'utf8');
    
    // Update or add localnet section
    if (anchorToml.includes('[programs.localnet]')) {
      anchorToml = anchorToml.replace(
        /\[programs\.localnet\][^\[]*/, 
        `[programs.localnet]\ncerberus_poker = "${programIds.cerberus_poker}"\ntexas_holdem = "${programIds.texas_holdem}"\n\n`
      );
    } else {
      anchorToml += `\n[programs.localnet]\ncerberus_poker = "${programIds.cerberus_poker}"\ntexas_holdem = "${programIds.texas_holdem}"\n`;
    }
    
    fs.writeFileSync(anchorTomlPath, anchorToml);
    log('✅ Updated Anchor.toml', 'green');

    // Update anchor.ts
    const anchorTsPath = path.join('examples', 'poker-ui', 'src', 'lib', 'anchor.ts');
    if (fs.existsSync(anchorTsPath)) {
      let anchorTs = fs.readFileSync(anchorTsPath, 'utf8');
      
      // Update program IDs
      anchorTs = anchorTs.replace(
        /export const CERBERUS_POKER_PROGRAM_ID = new PublicKey\(['"]([^'"]+)['"]\)/,
        `export const CERBERUS_POKER_PROGRAM_ID = new PublicKey('${programIds.cerberus_poker}')`
      );
      anchorTs = anchorTs.replace(
        /export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey\(['"]([^'"]+)['"]\)/,
        `export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey('${programIds.texas_holdem}')`
      );
      
      fs.writeFileSync(anchorTsPath, anchorTs);
      log('✅ Updated anchor.ts', 'green');
    }

    // Create/update .env
    const envPath = path.join('examples', 'poker-ui', '.env');
    const envContent = `VITE_RPC_URL=http://localhost:8899
VITE_CLUSTER_OFFSET=0
VITE_CERBERUS_POKER_PROGRAM_ID=${programIds.cerberus_poker}
VITE_TEXAS_HOLDEM_PROGRAM_ID=${programIds.texas_holdem}
`;
    fs.writeFileSync(envPath, envContent);
    log('✅ Created .env file', 'green');
  } else {
    log('⚠️  Could not extract program IDs from deploy output', 'yellow');
    log('   Please update them manually in:', 'yellow');
    log('   - packages/programs/Anchor.toml', 'cyan');
    log('   - examples/poker-ui/src/lib/anchor.ts', 'cyan');
  }

  // Step 9: Install frontend dependencies
  log('\n📦 Installing frontend dependencies...', 'blue');
  exec('cd examples/poker-ui && npm install');
  log('✅ Frontend dependencies installed', 'green');

  // Done!
  log('\n✅ Setup complete!', 'green');
  log('\n🚀 To start the development environment:', 'cyan');
  log('   npm run dev', 'bright');
  log('\n   This will start:', 'cyan');
  log('   - Local validator (if not running)', 'cyan');
  log('   - Frontend dev server at http://localhost:5173', 'cyan');
  log('\n📖 For more information, see SETUP.md', 'blue');
}

main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, 'red');
  process.exit(1);
});
