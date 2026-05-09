# 🎴 CerberusPoker

**Fully private multiplayer poker on Solana — powered by Arcium MPC**

> No one sees your cards. Not even the server.

CerberusPoker is a game-agnostic privacy protocol for card games on Solana. It uses Arcium's Multi-party eXecution Environment (MXE) for confidential deck shuffling, card dealing via threshold decryption, and atomic showdowns — all on-chain. The included Texas Hold'em implementation demonstrates a complete poker game with encrypted betting via USDC+ (Reflect Protocol).

---

## 🎯 Key Features

- **🔐 Complete Privacy**: Cards and bets encrypted via Arcium MPC (Cerberus protocol)
- **🎲 Provably Fair**: Cryptographically uniform shuffles, no single point of trust
- **⚡ Fast**: ~1 second per action, ~30 seconds for full shuffle
- **🎮 Game-Agnostic**: Build any card game (Poker, Blackjack, Bridge, etc.)
- **💰 Yield-Bearing**: USDC+ integration earns yield while you play
- **🛡️ Cheat-Proof**: MXE attestations + on-chain verification

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│            examples/poker-ui (Vite + React)           │
└──────────┬────────────────────────────┬───────────────┘
           │                            │
  ┌────────▼──────┐           ┌─────────▼─────────┐
  │ @cerberus-    │           │ @cerberus-poker/  │
  │ poker/core    │           │   deck + wager    │
  │ (SDK)         │           │   (SDK modules)   │
  └────────┬──────┘           └─────────┬─────────┘
           │                            │
  ┌────────▼────────────────────────────▼──────────┐
  │         Solana Programs (Anchor 0.32.1)         │
  │  ┌──────────────────┐  ┌─────────────────────┐ │
  │  │  cerberus_poker   │  │   texas_holdem      │ │
  │  │  (game-agnostic)  │──│  (game-specific)    │ │
  │  │  shuffle/deal/    │  │  betting/eval/      │ │
  │  │  reveal/timeout   │  │  showdown/settle    │ │
  │  └────────┬─────────┘  └─────────┬───────────┘ │
  └───────────┼──────────────────────┼─────────────┘
              │    CPI + Callbacks   │
  ┌───────────▼──────────────────────▼─────────────┐
  │          Arcium MXE (Devnet)                    │
  │  ┌─────────────┐  ┌────────────┐  ┌──────────┐ │
  │  │ shuffle_deck │  │ deal_card  │  │ reveal   │ │
  │  │ (ArcisRNG)  │  │ (threshold)│  │ (public) │ │
  │  └─────────────┘  └────────────┘  └──────────┘ │
  └────────────────────────────────────────────────┘
```

## 📦 Project Structure

| Package | Description |
|---------|-------------|
| `packages/programs/cerberus_poker` | Game-agnostic protocol: shuffle, deal, reveal, timeout |
| `packages/programs/texas_holdem` | Texas Hold'em: betting, hand eval, pot settlement |
| `packages/sdk/core` | SDK: wallet adapter, transaction builder, event subscriptions |
| `packages/sdk/deck` | Deck module: encrypted shuffle, deal, decrypt, reveal |
| `packages/sdk/wager` | Wager module: USDC+ betting, fold, call, settle |
| `mxe/` | Arcium MXE circuits: encrypted instructions |
| `examples/poker-ui` | React frontend: full poker table UI |

## 🚀 Quick Start

### One-Command Start (Easiest)

```bash
# Clone and install
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker
npm install

# Start everything (validator + programs + frontend)
npm start
```

**That's it!** Visit http://localhost:5173 and connect your wallet.

> **Note**: Requires Node.js 20+, Solana CLI 2.3.0, and Anchor 0.32.1 installed.  
> See [QUICKSTART.md](./QUICKSTART.md) for detailed setup or [SETUP.md](./SETUP.md) for prerequisites installation.

### What `npm start` Does

- ✅ Starts local Solana validator
- ✅ Builds and deploys programs
- ✅ Starts frontend dev server at http://localhost:5173

Press `Ctrl+C` to stop everything.

### Run Tests

```bash
# Solana program tests
cd packages/programs
anchor test

# SDK tests
npm test

# MXE tests (requires Docker)
cd mxe
arcium test
```

## 🎯 Deployed Contracts (Devnet)

| Program | Address |
|---------|---------|
| Arcium MXE | `A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V` |
| CerberusPoker | `4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG` |
| Texas Hold'em | `h9xwoEpELRp4tUExQDpyjg2cfzvEUL53wy76sUZWok9` |

**Devnet RPC**: https://api.devnet.solana.com  
**Cluster Offset**: 456

## 🔐 How It Works

### 1. Confidential Shuffle
Each player contributes a secret permutation. The MXE combines all permutations using `ArcisRNG::shuffle`, producing a cryptographically uniform deck ordering that no single player can predict or control.

### 2. Threshold Deal
Cards are dealt using threshold decryption. The MXE encrypts each card specifically for its recipient using `Enc<Shared, u8>` — only the recipient's private key can decrypt it.

### 3. Community Card Reveal
Community cards are revealed publicly via full MXE decryption. The plaintext value is stored on-chain with an MXE attestation proving correctness.

### 4. Atomic Showdown
At showdown, all hole cards are revealed atomically in a single MXE computation. The on-chain hand evaluator determines the winner, and the pot is settled via USDC+ transfer.

### 5. Encrypted Betting
Bet amounts are transferred as USDC+ (Reflect Protocol) to an escrow PDA. Encrypted bet amounts are stored in the MXE as `Enc<Mxe, u64>`. Future upgrade path to C-SPL tokens for full confidentiality.

## 🏗️ Building New Card Games

CerberusPoker is game-agnostic! To build a new card game (e.g., Blackjack):

1. **Use `cerberus_poker` as-is** for shuffle, deal, and reveal
2. **Create a new program** (like `texas_holdem`) for your game logic
3. **Call `cerberus_poker` via CPI** for card operations
4. **Use the SDK modules** in your frontend

Example:
```rust
// Your Blackjack program
use cerberus_poker::cpi::accounts::DealCards;
use cerberus_poker::program::CerberusPoker;

// Deal cards via CPI
let cpi_ctx = CpiContext::new(
    ctx.accounts.cerberus_poker_program.to_account_info(),
    DealCards { /* accounts */ }
);
cerberus_poker::cpi::deal_cards(cpi_ctx, assignments)?;
```

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in under 5 minutes
- **[TESTER_GUIDE.md](./TESTER_GUIDE.md)** - Guide for testers (one command to start)
- **[SETUP.md](./SETUP.md)** - Complete local setup guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical architecture and design decisions
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development guide, testing, deployment
- **[packages/sdk/wager/C-SPL-UPGRADE-PATH.md](./packages/sdk/wager/C-SPL-UPGRADE-PATH.md)** - Future C-SPL migration guide

## 🤝 Contributing

Contributions are welcome! Please see [DEVELOPMENT.md](./DEVELOPMENT.md) for guidelines.

## 📄 License

MIT

## 🔗 Links

- **Arcium Documentation**: https://docs.arcium.com
- **Reflect Protocol**: https://reflect.finance
- **Solana**: https://solana.com
- **Anchor**: https://www.anchor-lang.com
