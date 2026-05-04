# 🧪 CerberusPoker Tester Guide

**Quick guide for testers to get CerberusPoker running locally.**

---

## ⚡ Super Quick Start (3 Commands)

```bash
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker
npm install
npm start
```

**Done!** Open http://localhost:5173 in your browser.

---

## 📋 Prerequisites

You need these installed first:

1. **Node.js 20+** - https://nodejs.org/
2. **Solana CLI 2.3.0** - https://docs.solana.com/cli/install-solana-cli-tools
3. **Anchor 0.32.1** - https://www.anchor-lang.com/docs/installation

### Verify Prerequisites

After installing, run:

```bash
npm run verify
```

This checks if everything is installed correctly.

---

## 🚀 Starting the Application

### Option 1: One Command (Recommended)

```bash
npm start
```

This starts:
- Local Solana validator
- Builds and deploys programs
- Frontend dev server

**Frontend URL**: http://localhost:5173

### Option 2: Step by Step

If you want to see each step:

**Terminal 1** - Start validator:
```bash
solana-test-validator
```

**Terminal 2** - Deploy programs:
```bash
cd packages/programs
anchor build
anchor deploy
```

**Terminal 3** - Start frontend:
```bash
cd examples/poker-ui
npm run dev
```

---

## 🎮 Testing the Game

### 1. Setup Your Wallet

**Install a Solana wallet:**
- [Phantom](https://phantom.app/) (recommended)
- [Backpack](https://backpack.app/)

**Configure wallet for localnet:**
1. Open wallet settings
2. Change network to "Custom RPC"
3. Set RPC URL: `http://localhost:8899`

### 2. Create a Game

1. Open http://localhost:5173
2. Click "Connect Wallet"
3. Go to "Lobby"
4. Click "Create Table"
5. Set:
   - Max Players: 2-6
   - Small Blind: 1
   - Big Blind: 2
6. Click "Create"
7. **Copy the Game ID** (you'll need this)

### 3. Join as Second Player

**Option A: Use Incognito Window**
1. Open http://localhost:5173 in incognito/private window
2. Connect a different wallet
3. Enter the Game ID
4. Click "Join"

**Option B: Use Different Browser**
1. Open http://localhost:5173 in Chrome/Firefox/Safari
2. Connect a different wallet
3. Enter the Game ID
4. Click "Join"

### 4. Play the Game

Once 2+ players join:
- ✅ Shuffle starts automatically
- ✅ Cards are dealt privately
- ✅ Betting rounds begin
- ✅ Winner determined at showdown

---

## 🐛 Common Issues

### "Connection refused"

**Problem**: Validator not running

**Fix**:
```bash
solana-test-validator
```

### "Program not found"

**Problem**: Programs not deployed

**Fix**:
```bash
cd packages/programs
anchor build
anchor deploy
```

### "Insufficient funds"

**Problem**: Wallet has no SOL

**Fix**:
```bash
solana airdrop 10
```

### Wallet won't connect

**Problem**: Wallet on wrong network

**Fix**:
1. Open wallet settings
2. Change to "Localnet" or "Custom RPC"
3. Set URL: `http://localhost:8899`

### Port 8899 in use

**Problem**: Old validator still running

**Fix**:
```bash
pkill solana-test-validator
solana-test-validator --reset
```

### Frontend won't start

**Problem**: Dependencies not installed

**Fix**:
```bash
cd examples/poker-ui
npm install
npm run dev
```

---

## 🔄 Restarting Everything

If something goes wrong, restart everything:

```bash
# Stop all processes (Ctrl+C in each terminal)

# Kill any remaining processes
pkill solana-test-validator

# Start fresh
npm start
```

---

## 📊 What to Test

### Basic Functionality
- [ ] Create a game
- [ ] Join a game
- [ ] Shuffle completes
- [ ] Cards are dealt
- [ ] Can place bets
- [ ] Can fold
- [ ] Can call
- [ ] Can raise
- [ ] Showdown works
- [ ] Winner receives pot

### Edge Cases
- [ ] Timeout when player doesn't act
- [ ] Multiple players fold
- [ ] All-in scenarios
- [ ] Split pot (tie)
- [ ] Player disconnects

### UI/UX
- [ ] Wallet connects smoothly
- [ ] Game state updates in real-time
- [ ] Cards display correctly
- [ ] Betting controls work
- [ ] Error messages are clear

---

## 📝 Reporting Issues

When reporting bugs, include:

1. **What you did** - Steps to reproduce
2. **What happened** - Actual behavior
3. **What you expected** - Expected behavior
4. **Screenshots** - If applicable
5. **Console logs** - Open browser DevTools (F12) → Console tab
6. **Environment**:
   ```bash
   node --version
   solana --version
   anchor --version
   ```

---

## 🎯 Test Scenarios

### Scenario 1: Basic 2-Player Game

1. Player A creates game
2. Player B joins
3. Both players play through to showdown
4. Verify winner receives pot

### Scenario 2: Multi-Player with Folds

1. Create 4-player game
2. Player 1 folds pre-flop
3. Player 2 folds on flop
4. Players 3 and 4 play to showdown
5. Verify correct winner

### Scenario 3: Timeout

1. Create 2-player game
2. Player 1 doesn't act within timeout
3. Verify timeout triggers
4. Verify game continues

### Scenario 4: All-In

1. Create 2-player game
2. Player 1 goes all-in
3. Player 2 calls
4. Verify showdown and settlement

---

## 🆘 Getting Help

- **Quick issues**: Check [Common Issues](#-common-issues) above
- **Setup problems**: See [SETUP.md](./SETUP.md)
- **Detailed guide**: See [QUICKSTART.md](./QUICKSTART.md)
- **Architecture questions**: See [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## ✅ Quick Reference

```bash
# Verify setup
npm run verify

# Start everything
npm start

# Stop everything
Ctrl+C

# Restart validator
pkill solana-test-validator
solana-test-validator --reset

# Check wallet balance
solana balance

# Fund wallet
solana airdrop 10

# View logs
solana logs
```

---

**Happy Testing! 🎴**

If you find any issues, please report them with as much detail as possible.
