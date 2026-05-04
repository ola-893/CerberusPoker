# 🚀 CerberusPoker Quick Start

Get CerberusPoker running locally in **under 5 minutes**.

## Prerequisites

Before you start, make sure you have these installed:

- **Node.js 20+** - [Download](https://nodejs.org/)
- **Solana CLI 2.3.0** - [Install Guide](https://docs.solana.com/cli/install-solana-cli-tools)
- **Anchor 0.32.1** - [Install Guide](https://www.anchor-lang.com/docs/installation)

### Quick Prerequisites Check

```bash
# Verify all prerequisites are installed
npm run verify

# Or check manually
node --version    # Should be v20.x.x or higher
solana --version  # Should be 2.3.0
anchor --version  # Should be 0.32.1
```

If any are missing, see [SETUP.md](./SETUP.md) for detailed installation instructions.

---

## Option 1: One-Command Start (Recommended for Testers)

This is the **easiest way** to get started. Just run:

```bash
# Clone the repository
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker

# Install dependencies
npm install

# Start everything (validator + programs + frontend)
npm start
```

That's it! The script will:
1. ✅ Start the local Solana validator
2. ✅ Build and deploy the programs
3. ✅ Start the frontend dev server

**Frontend will be available at: http://localhost:5173**

### What `npm start` Does

- Starts a local Solana validator on port 8899
- Builds the Solana programs (cerberus_poker + texas_holdem)
- Deploys programs to the local validator
- Starts the React frontend with hot reload

### Stopping the Development Environment

Press `Ctrl+C` in the terminal to stop all processes.

---

## Option 2: Manual Setup (For Developers)

If you want more control over each step:

### Step 1: Clone and Install

```bash
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker
npm install
```

### Step 2: Start Local Validator

In a **separate terminal**, start the validator:

```bash
solana-test-validator
```

Keep this running throughout development.

### Step 3: Configure Solana

```bash
# Set Solana to use localnet
solana config set --url localhost

# Create a wallet (if you don't have one)
solana-keygen new

# Fund your wallet
solana airdrop 10
```

### Step 4: Build and Deploy Programs

```bash
cd packages/programs
anchor build
anchor deploy
```

**Important**: After deployment, you'll see program IDs in the output. Update them in:
- `packages/programs/Anchor.toml` (under `[programs.localnet]`)
- `examples/poker-ui/src/lib/anchor.ts`

### Step 5: Start Frontend

```bash
cd ../../examples/poker-ui

# Create .env file
cat > .env << EOF
VITE_RPC_URL=http://localhost:8899
VITE_CLUSTER_OFFSET=0
EOF

# Install dependencies and start
npm install
npm run dev
```

**Frontend will be available at: http://localhost:5173**

---

## Option 3: Automated Setup Script

Run the setup script once, then use `npm start`:

```bash
# Clone and install
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker
npm install

# Run automated setup (requires validator to be running)
# Terminal 1: Start validator
solana-test-validator

# Terminal 2: Run setup
npm run setup:local

# After setup completes, start development
npm start
```

---

## Testing the Application

### 1. Connect Your Wallet

1. Open http://localhost:5173
2. Click "Connect Wallet"
3. Select Phantom or Backpack
4. Approve the connection

**Don't have a wallet?**
- Install [Phantom](https://phantom.app/) or [Backpack](https://backpack.app/)
- Make sure your wallet is set to **Localnet** (Custom RPC: http://localhost:8899)

### 2. Create a Game

1. Go to the Lobby
2. Fill in game settings:
   - Max Players: 2-6
   - Small Blind: 1
   - Big Blind: 2
3. Click "Create Table"
4. Copy the Game ID

### 3. Join the Game (Second Player)

1. Open http://localhost:5173 in an **incognito window** or **different browser**
2. Connect a different wallet
3. Enter the Game ID
4. Click "Join Game"

### 4. Play Poker!

Once 2+ players have joined:
- The shuffle phase starts automatically
- Cards are dealt privately
- Play through betting rounds
- Winner is determined at showdown

---

## Troubleshooting

### "Connection refused" Error

**Problem**: Validator isn't running.

**Solution**:
```bash
# Start validator in a separate terminal
solana-test-validator
```

### "Program not found" Error

**Problem**: Programs aren't deployed.

**Solution**:
```bash
cd packages/programs
anchor build
anchor deploy
```

### "Insufficient funds" Error

**Problem**: Wallet doesn't have SOL.

**Solution**:
```bash
solana airdrop 10
```

### Port 8899 Already in Use

**Problem**: Another validator is running.

**Solution**:
```bash
# Kill existing validator
pkill solana-test-validator

# Start fresh
solana-test-validator --reset
```

### Frontend Won't Start

**Problem**: Dependencies not installed.

**Solution**:
```bash
cd examples/poker-ui
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Wallet Won't Connect

**Problem**: Wallet is on wrong network.

**Solution**:
1. Open your wallet settings
2. Change network to "Localnet" or "Custom RPC"
3. Set RPC URL to: http://localhost:8899
4. Refresh the page

---

## Next Steps

Once you have the app running:

1. **Explore the UI** - Try creating and joining games
2. **Read the docs** - Check out [ARCHITECTURE.md](./ARCHITECTURE.md) to understand how it works
3. **Run tests** - `npm test` to run the test suite
4. **Build something** - Use the SDK to create your own card game

---

## Available Commands

```bash
# Start everything (validator + programs + frontend)
npm start

# Or use the alias
npm run dev

# Run automated setup
npm run setup:local

# Build all programs
npm run build

# Run all tests
npm test

# Deploy to localnet
npm run deploy:local

# Clean build artifacts
npm run clean
```

---

## Development Workflow

For active development, use this workflow:

```bash
# Terminal 1: Validator
solana-test-validator

# Terminal 2: Watch and rebuild programs
cd packages/programs
anchor build --watch

# Terminal 3: Frontend with hot reload
cd examples/poker-ui
npm run dev

# Terminal 4: Run tests
npm test -- --watch
```

---

## Getting Help

- **Setup issues?** See [SETUP.md](./SETUP.md)
- **Development questions?** See [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Architecture questions?** See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Found a bug?** Open an issue on GitHub

---

## Summary

**Fastest way to start:**
```bash
git clone <repo>
cd CerberusPoker
npm install
npm start
```

**That's it!** Visit http://localhost:5173 and start playing poker with complete privacy! 🎴
