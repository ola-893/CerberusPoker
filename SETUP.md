# CerberusPoker Setup Guide

Complete guide for setting up CerberusPoker locally or deploying to devnet/mainnet.

> **🚀 Quick Start**: For the fastest way to get started, see [QUICKSTART.md](./QUICKSTART.md) - just run `npm start`!

## Table of Contents

1. [Prerequisites Installation](#prerequisites-installation)
2. [Local Development Setup](#local-development-setup)
3. [Devnet Deployment](#devnet-deployment)
4. [Mainnet Deployment](#mainnet-deployment)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites Installation

### 1. Install Rust (1.89.0 - Required by Arcium)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Set specific version required by Arcium
rustup default 1.89.0

# Verify installation
rustc --version  # Should show: rustc 1.89.0
```

### 2. Install Solana CLI (2.3.0)

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v2.3.0/install)"

# Add to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Verify installation
solana --version  # Should show: solana-cli 2.3.0
```

### 3. Install Anchor CLI (0.32.1)

```bash
# Install Anchor Version Manager (AVM)
cargo install --git https://github.com/coral-xyz/anchor avm --force

# Install Anchor 0.32.1 (required by Arcium)
avm install 0.32.1
avm use 0.32.1

# Verify installation
anchor --version  # Should show: anchor-cli 0.32.1
```

### 4. Install Arcium CLI (0.9.7)

```bash
# Install Arcium toolchain
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash

# Install Arcium components
arcup install

# Verify installation
arcium --version  # Should show: arcium 0.9.7
```

### 5. Install Node.js (≥ 20)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Verify installation
node --version  # Should show: v20.x.x
npm --version   # Should show: 10.x.x
```

### 6. Install Docker (for MXE local testing)

```bash
# macOS
brew install docker

# Linux
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verify installation
docker --version
docker-compose --version
```

---

## Local Development Setup

### Step 1: Clone and Install Dependencies

```bash
# Clone repository
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker

# Install Node dependencies
npm install
```

### Step 2: Configure Solana for Localnet

```bash
# Set Solana to localnet
solana config set --url localhost

# Create a wallet if you don't have one
solana-keygen new --outfile ~/.config/solana/id.json

# Verify configuration
solana config get
```

### Step 3: Start Local Validator

```bash
# In a separate terminal, start the validator
solana-test-validator

# Keep this running throughout development
```

### Step 4: Fund Your Wallet

```bash
# In another terminal, airdrop SOL
solana airdrop 10

# Verify balance
solana balance  # Should show: 10 SOL
```

### Step 5: Build Solana Programs

```bash
cd packages/programs

# Build programs
anchor build

# This creates:
# - target/deploy/cerberus_poker.so
# - target/deploy/texas_holdem.so
# - target/idl/cerberus_poker.json
# - target/idl/texas_holdem.json
```

### Step 6: Deploy Programs to Localnet

```bash
# Still in packages/programs
anchor deploy

# Output will show program IDs like:
# Program Id: CMtyqKPtwG3Eyfwg36cZXycNsdHBXANW6ZHY5SWVa6ye
```

### Step 7: Update Program IDs

After deployment, update the program IDs in:

**1. `packages/programs/Anchor.toml`**
```toml
[programs.localnet]
cerberus_poker = "YOUR_CERBERUS_POKER_PROGRAM_ID"
texas_holdem = "YOUR_TEXAS_HOLDEM_PROGRAM_ID"
```

**2. `examples/poker-ui/src/lib/anchor.ts`**
```typescript
export const CERBERUS_POKER_PROGRAM_ID = new PublicKey('YOUR_CERBERUS_POKER_PROGRAM_ID');
export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey('YOUR_TEXAS_HOLDEM_PROGRAM_ID');
```

### Step 8: Build and Deploy MXE (Optional for Local Testing)

```bash
cd ../../mxe

# Build MXE
arcium build

# For local testing with Docker
arcium test

# Note: Full MXE deployment requires devnet/mainnet
```

### Step 9: Start Frontend

```bash
cd ../examples/poker-ui

# Create .env file
echo "VITE_RPC_URL=http://localhost:8899" > .env
echo "VITE_CLUSTER_OFFSET=0" >> .env

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit http://localhost:5173 and connect your wallet!

---

## Devnet Deployment

### Step 1: Configure Solana for Devnet

```bash
# Set Solana to devnet
solana config set --url devnet

# Verify configuration
solana config get
```

### Step 2: Fund Your Wallet

```bash
# Request devnet SOL (may need multiple times)
solana airdrop 2
solana airdrop 2
solana airdrop 2

# Verify balance
solana balance  # Should have ~6 SOL
```

### Step 3: Deploy MXE to Devnet

```bash
cd mxe

# Build MXE
arcium build

# Deploy to devnet (cluster offset 456)
arcium deploy \
  --cluster-offset 456 \
  --recovery-set-size 4 \
  --keypair-path ~/.config/solana/id.json \
  -u d

# Save the MXE Program ID from output
# Example: A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V
```

### Step 4: Deploy Solana Programs

```bash
cd ../packages/programs

# Build programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Save the program IDs from output
```

### Step 5: Initialize Computation Definitions

After deploying the MXE and Solana programs, you need to initialize the computation definitions on-chain:

```bash
# This registers the MXE circuits with the Solana programs
# Run the initialization script (you'll need to create this)
cd ../..
npx tsx scripts/init-comp-defs.ts --cluster devnet
```

### Step 6: Update Configuration

**1. `packages/programs/Anchor.toml`**
```toml
[programs.devnet]
cerberus_poker = "YOUR_DEVNET_CERBERUS_POKER_ID"
texas_holdem = "YOUR_DEVNET_TEXAS_HOLDEM_ID"
```

**2. `examples/poker-ui/src/lib/anchor.ts`**
```typescript
export const CERBERUS_POKER_PROGRAM_ID = new PublicKey('YOUR_DEVNET_CERBERUS_POKER_ID');
export const TEXAS_HOLDEM_PROGRAM_ID = new PublicKey('YOUR_DEVNET_TEXAS_HOLDEM_ID');
export const ARCIUM_MXE_PROGRAM_ID = new PublicKey('YOUR_MXE_PROGRAM_ID');
export const CLUSTER_OFFSET = 456; // devnet
```

**3. `examples/poker-ui/.env`**
```bash
VITE_RPC_URL=https://api.devnet.solana.com
VITE_CLUSTER_OFFSET=456
```

### Step 7: Deploy Frontend

```bash
cd examples/poker-ui

# Build for production
npm run build

# Deploy to Vercel (or your preferred host)
vercel --prod

# Or deploy to Netlify
netlify deploy --prod
```

### Step 8: Verify Deployment

```bash
# Test the deployed programs
cd packages/programs
anchor test --provider.cluster devnet --skip-build

# Test MXE
cd ../../mxe
arcium test --cluster devnet
```

---

## Mainnet Deployment

⚠️ **WARNING**: Mainnet deployment requires significant SOL for rent and deployment costs. Ensure you have:
- At least 20 SOL for program deployment
- Additional SOL for MXE deployment and initialization
- Thoroughly tested on devnet first

### Step 1: Configure Solana for Mainnet

```bash
# Set Solana to mainnet
solana config set --url mainnet-beta

# Verify configuration
solana config get
```

### Step 2: Fund Your Wallet

```bash
# Transfer SOL to your deployment wallet
# You'll need to purchase SOL from an exchange

# Verify balance
solana balance  # Should have at least 20 SOL
```

### Step 3: Deploy MXE to Mainnet

```bash
cd mxe

# Build MXE
arcium build

# Deploy to mainnet (cluster offset 2026)
arcium deploy \
  --cluster-offset 2026 \
  --recovery-set-size 4 \
  --keypair-path ~/.config/solana/id.json \
  -u m

# Save the MXE Program ID
```

### Step 4: Deploy Solana Programs

```bash
cd ../packages/programs

# Build programs
anchor build

# Deploy to mainnet
anchor deploy --provider.cluster mainnet

# Save the program IDs
```

### Step 5: Initialize Computation Definitions

```bash
cd ../..
npx tsx scripts/init-comp-defs.ts --cluster mainnet
```

### Step 6: Update Configuration

Update all configuration files with mainnet program IDs and cluster offset 2026.

### Step 7: Deploy Frontend

```bash
cd examples/poker-ui

# Update .env for mainnet
echo "VITE_RPC_URL=https://api.mainnet-beta.solana.com" > .env
echo "VITE_CLUSTER_OFFSET=2026" >> .env

# Build and deploy
npm run build
vercel --prod
```

---

## Troubleshooting

### "Program not found" Error

**Problem**: Programs aren't deployed yet.

**Solution**:
```bash
cd packages/programs
anchor deploy
```

### "Insufficient funds" Error

**Problem**: Not enough SOL for transactions.

**Solution**:
```bash
# Localnet
solana airdrop 10

# Devnet
solana airdrop 2  # May need multiple times

# Mainnet
# Purchase SOL from an exchange
```

### "Connection refused" Error (Localnet)

**Problem**: Local validator isn't running.

**Solution**:
```bash
# Start validator in a separate terminal
solana-test-validator
```

### "Transaction simulation failed" Error

**Problem**: Account PDAs or instruction parameters are incorrect.

**Solution**:
```bash
# Check program logs
solana logs

# Verify account derivation
# Check that PDAs match between program and client
```

### Anchor Version Mismatch

**Problem**: Wrong Anchor version installed.

**Solution**:
```bash
# Install correct version
avm install 0.32.1
avm use 0.32.1

# Verify
anchor --version  # Should show 0.32.1
```

### Rust Version Mismatch

**Problem**: Arcium requires Rust 1.89.0.

**Solution**:
```bash
# Set correct version
rustup default 1.89.0

# Verify
rustc --version  # Should show 1.89.0
```

### MXE Build Errors

**Problem**: indexmap dependency conflict.

**Solution**: This is already fixed in `mxe/Cargo.toml` with a git patch:
```toml
[patch.crates-io]
indexmap = { git = "https://github.com/indexmap-rs/indexmap", tag = "2.13.0" }
```

### Docker Not Running (MXE Tests)

**Problem**: `arcium test` requires Docker.

**Solution**:
```bash
# Start Docker daemon
# macOS: Open Docker Desktop
# Linux: sudo systemctl start docker

# Verify Docker is running
docker ps
```

### Wallet Not Connecting (Frontend)

**Problem**: Wallet extension not detected.

**Solution**:
1. Install Phantom or Backpack wallet extension
2. Refresh the page
3. Check browser console for errors
4. Ensure wallet is on the correct network (localnet/devnet/mainnet)

---

## Quick Reference

### Useful Commands

```bash
# Check Solana configuration
solana config get

# Check wallet balance
solana balance

# Check program account
solana account <PROGRAM_ID>

# View transaction logs
solana logs

# Build programs
cd packages/programs && anchor build

# Run tests
cd packages/programs && anchor test

# Deploy programs
cd packages/programs && anchor deploy

# Build MXE
cd mxe && arcium build

# Test MXE
cd mxe && arcium test

# Start frontend
cd examples/poker-ui && npm run dev
```

### Network Endpoints

| Network | RPC URL | Cluster Offset |
|---------|---------|----------------|
| Localnet | http://localhost:8899 | 0 |
| Devnet | https://api.devnet.solana.com | 456 |
| Mainnet | https://api.mainnet-beta.solana.com | 2026 |

### Program Sizes

| Program | Size | Rent (SOL) |
|---------|------|------------|
| cerberus_poker | ~200 KB | ~1.5 SOL |
| texas_holdem | ~180 KB | ~1.3 SOL |
| MXE | ~150 KB | ~1.1 SOL |

---

## Next Steps

After successful setup:

1. **Read [ARCHITECTURE.md](./ARCHITECTURE.md)** to understand the system design
2. **Read [DEVELOPMENT.md](./DEVELOPMENT.md)** for development workflows
3. **Explore the SDK** in `packages/sdk/`
4. **Try the example UI** in `examples/poker-ui/`
5. **Build your own card game** using the CerberusPoker protocol

---

**Need Help?**

- Check the [Troubleshooting](#troubleshooting) section
- Review [DEVELOPMENT.md](./DEVELOPMENT.md) for common development tasks
- Open an issue on GitHub
