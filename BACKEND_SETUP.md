# Backend Setup Guide - Deploy CerberusPoker Programs

## Current Status

✅ **UI Integration Complete** - All transaction builders and hooks are ready
❌ **Programs Not Deployed** - Need to build and deploy Solana programs
❌ **Rust/Anchor Not Installed** - Need to install development tools

## Prerequisites Installation

### 1. Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup --version
```

### 2. Install Solana CLI
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version
```

### 3. Install Anchor CLI
```bash
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli
anchor --version
```

### 4. Install Node Dependencies
```bash
npm install --legacy-peer-deps
```

## Deployment Options

### Option 1: Deploy to Localnet (Fastest for Development)

**Step 1: Start Local Validator**
```bash
solana-test-validator
```

**Step 2: Configure Solana CLI**
```bash
solana config set --url localhost
solana config get
```

**Step 3: Create/Fund Wallet**
```bash
# If you don't have a wallet
solana-keygen new

# Fund it with SOL
solana airdrop 10
solana balance
```

**Step 4: Build Programs**
```bash
make build-programs
# OR
cd packages/programs && anchor build
```

**Step 5: Deploy Programs**
```bash
cd packages/programs
anchor deploy
```

**Step 6: Update Program IDs**
After deployment, Anchor will output the program IDs. Update them in:
- `packages/programs/Anchor.toml` under `[programs.localnet]`
- `examples/poker-ui/src/lib/anchor.ts`

**Step 7: Configure UI**
```bash
cd examples/poker-ui
echo "VITE_RPC_URL=http://localhost:8899" > .env
```

**Step 8: Start UI**
```bash
npm run dev
```

### Option 2: Deploy to Devnet (For Testing with Others)

**Step 1: Configure Solana CLI**
```bash
solana config set --url devnet
solana config get
```

**Step 2: Fund Wallet**
```bash
# Request devnet SOL (may need to do this multiple times)
solana airdrop 2
solana airdrop 2
solana balance
```

**Step 3: Build Programs**
```bash
make build-programs
```

**Step 4: Deploy to Devnet**
```bash
make deploy-devnet
# OR
cd packages/programs && anchor deploy --provider.cluster devnet
```

**Step 5: Update Program IDs**
Update the deployed program IDs in:
- `packages/programs/Anchor.toml` under `[programs.devnet]`
- `examples/poker-ui/src/lib/anchor.ts`

**Step 6: Configure UI**
```bash
cd examples/poker-ui
echo "VITE_RPC_URL=https://api.devnet.solana.com" > .env
```

**Step 7: Start UI**
```bash
npm run dev
```

## Verification

After deployment, verify the programs are accessible:

```bash
cd examples/poker-ui
npx tsx scripts/verify-deployment.ts
```

You should see:
```
✅ cerberus_poker: Deployed and executable
✅ texas_holdem: Deployed and executable
```

## Testing the Integration

### 1. Start the UI
```bash
cd examples/poker-ui
npm run dev
```

### 2. Connect Phantom Wallet
- Open http://localhost:3000
- Click "Connect Wallet"
- Make sure your wallet is on the same network (localnet/devnet)

### 3. Create a Game
- Go to Lobby
- Fill in game settings:
  - Max Players: 4
  - Small Blind: 1
  - Big Blind: 2
- Click "Create Table"

### 4. Test Game Flow
- Open in another browser/incognito window
- Connect different wallet
- Join the game
- Start shuffle (need 2+ players)
- Play through a hand

## Troubleshooting

### "Program not found"
- Programs aren't deployed yet
- Run `anchor deploy` in `packages/programs`

### "Account exists but is not executable"
- The address in Anchor.toml is a wallet, not a program
- Deploy the programs and update the IDs

### "Insufficient funds"
- Need SOL for transactions
- Localnet: `solana airdrop 10`
- Devnet: `solana airdrop 2` (may need multiple times)

### "Transaction simulation failed"
- Check program logs: `solana logs`
- Verify account PDAs are correct
- Check instruction parameters

### "Connection refused" (localnet)
- Start validator: `solana-test-validator`
- Check it's running: `solana cluster-version`

## Current Program IDs (Need to be Updated After Deployment)

```
cerberus_poker: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
texas_holdem: HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65
```

These are currently NOT deployed programs. After running `anchor deploy`, you'll get new program IDs that need to be updated in:
1. `packages/programs/Anchor.toml`
2. `examples/poker-ui/src/lib/anchor.ts`

## Next Steps After Deployment

Once programs are deployed and verified:

1. **Update TanStack Query hooks** to use real data (currently using mocks)
2. **Wire up Lobby buttons** to call transaction functions
3. **Test full game flow** end-to-end
4. **Add error handling** for failed transactions
5. **Implement event listeners** for automatic state updates

## Quick Start (If Everything is Installed)

```bash
# Terminal 1: Start validator
solana-test-validator

# Terminal 2: Deploy programs
cd packages/programs
anchor build
anchor deploy

# Update program IDs in Anchor.toml and anchor.ts

# Terminal 3: Start UI
cd examples/poker-ui
echo "VITE_RPC_URL=http://localhost:8899" > .env
npm run dev
```

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana CLI Documentation](https://docs.solana.com/cli)
- [Solana Program Deployment](https://docs.solana.com/cli/deploy-a-program)
