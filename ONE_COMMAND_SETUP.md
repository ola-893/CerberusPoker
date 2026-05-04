# 🚀 One-Command Setup Summary

This document summarizes the one-command setup added to CerberusPoker.

## For Your Tester

**Send them this:**

```
Hi! To test CerberusPoker, just run these 3 commands:

git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker
npm install
npm start

Then open http://localhost:5173 in your browser.

Full guide: See TESTER_GUIDE.md in the repo.
```

---

## What Was Added

### 1. NPM Scripts (package.json)

```json
{
  "scripts": {
    "start": "npm run dev",
    "dev": "concurrently --kill-others ...",
    "dev:validator": "solana-test-validator --reset",
    "dev:programs": "wait-on tcp:8899 && anchor build && deploy",
    "dev:ui": "wait-on tcp:8899 && npm run dev",
    "setup:local": "node scripts/setup-local.js",
    "verify": "bash scripts/verify-setup.sh"
  }
}
```

### 2. Helper Scripts

**scripts/setup-local.js**
- Automated setup script
- Checks prerequisites
- Configures Solana
- Builds and deploys programs
- Updates config files

**scripts/start-dev.sh**
- Bash script alternative
- Starts validator if not running
- Deploys programs
- Starts frontend

**scripts/verify-setup.sh**
- Verifies all prerequisites
- Checks versions
- Validates configuration

### 3. Documentation

**QUICKSTART.md**
- Quick start guide
- 3 setup options
- Testing instructions
- Troubleshooting

**TESTER_GUIDE.md**
- Simplified guide for testers
- One-command start
- Common issues
- Test scenarios

**ONE_COMMAND_SETUP.md** (this file)
- Summary of changes
- Quick reference

---

## How It Works

### `npm start` Flow

```
npm start
    ↓
npm run dev
    ↓
concurrently runs 3 processes:
    ├─ dev:validator → solana-test-validator --reset
    ├─ dev:programs  → wait-on tcp:8899 → anchor build → anchor deploy
    └─ dev:ui        → wait-on tcp:8899 → npm run dev (frontend)
```

### Dependencies

- **concurrently**: Runs multiple processes simultaneously
- **wait-on**: Waits for validator to be ready before deploying

---

## Available Commands

```bash
# Verify prerequisites
npm run verify

# Start everything (validator + programs + frontend)
npm start
# or
npm run dev

# Run automated setup
npm run setup:local

# Deploy programs only
npm run deploy:local

# Build all
npm run build

# Run tests
npm test

# Clean
npm run clean
```

---

## File Structure

```
CerberusPoker/
├── package.json                 # Added dev scripts
├── scripts/
│   ├── setup-local.js          # Automated setup
│   ├── start-dev.sh            # Bash starter
│   └── verify-setup.sh         # Prerequisites check
├── QUICKSTART.md               # Quick start guide
├── TESTER_GUIDE.md             # Tester-focused guide
└── ONE_COMMAND_SETUP.md        # This file
```

---

## Prerequisites

Users still need to install:
1. Node.js 20+
2. Solana CLI 2.3.0
3. Anchor 0.32.1

But after that, it's just `npm start`!

---

## Troubleshooting

### If `npm start` fails

1. **Check prerequisites**: `npm run verify`
2. **Kill old processes**: `pkill solana-test-validator`
3. **Try again**: `npm start`

### If programs don't deploy

1. **Stop npm start** (Ctrl+C)
2. **Deploy manually**:
   ```bash
   cd packages/programs
   anchor build
   anchor deploy
   ```
3. **Update program IDs** in:
   - `packages/programs/Anchor.toml`
   - `examples/poker-ui/src/lib/anchor.ts`

### If frontend won't start

1. **Check dependencies**:
   ```bash
   cd examples/poker-ui
   npm install
   ```
2. **Check .env file exists**:
   ```bash
   cat .env
   # Should show:
   # VITE_RPC_URL=http://localhost:8899
   # VITE_CLUSTER_OFFSET=0
   ```

---

## Benefits

✅ **One command** to start everything  
✅ **Automatic** validator startup  
✅ **Automatic** program deployment  
✅ **Automatic** frontend startup  
✅ **Color-coded** process output  
✅ **Easy** to stop (Ctrl+C)  
✅ **Verified** setup script  
✅ **Comprehensive** tester guide  

---

## For Developers

If you want more control, you can still run each component separately:

```bash
# Terminal 1
solana-test-validator

# Terminal 2
cd packages/programs
anchor build --watch

# Terminal 3
cd examples/poker-ui
npm run dev
```

---

## Summary

**Before**: Testers needed to:
1. Start validator manually
2. Build programs manually
3. Deploy programs manually
4. Update config files manually
5. Start frontend manually

**After**: Testers just run:
```bash
npm start
```

**That's it!** 🎉
