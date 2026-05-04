# 🎴 CerberusPoker

**Fully private multiplayer poker on Solana — powered by Arcium MPC**

> No one sees your cards. Not even the server.

CerberusPoker is a game-agnostic privacy protocol for card games on Solana. It uses Arcium's Multi-party eXecution Environment (MXE) for confidential deck shuffling, card dealing via threshold decryption, and atomic showdowns — all on-chain. The included Texas Hold'em implementation demonstrates a complete poker game with encrypted betting via USDC+ (Reflect Protocol).

---

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

## 📦 Packages

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

### Prerequisites

- [Solana CLI 2.3.0](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor 0.32.1](https://www.anchor-lang.com/docs/installation) (`avm install 0.32.1`)
- [Arcium CLI 0.9.7](https://docs.arcium.com/) (`curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash`)
- Node.js ≥ 20

### Setup

```bash
# Clone and install
git clone https://github.com/your-org/CerberusPoker.git
cd CerberusPoker
npm install

# Configure Solana for devnet
solana config set --url devnet

# Build Solana programs
cd packages/programs
anchor build

# Run frontend
cd ../../examples/poker-ui
npm run dev
```

### Run Tests

```bash
# Anchor tests (Solana programs)
cd packages/programs
anchor test

# SDK tests
cd packages/sdk/core && npm test
cd packages/sdk/deck && npm test
cd packages/sdk/wager && npm test

# MXE tests
cd mxe
arcium test
```

## 🎯 Deployed Contracts (Devnet)

| Program | Address |
|---------|---------|
| Arcium MXE | `A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V` |
| CerberusPoker | `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` |
| Texas Hold'em | `HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65` |

## 🔐 How It Works

### 1. Confidential Shuffle
Each player contributes a secret permutation. The MXE combines all permutations using `ArcisRNG::shuffle`, producing a cryptographically uniform deck ordering that no single player can predict or control.

### 2. Threshold Deal
Cards are dealt using threshold decryption. The MXE encrypts each card specifically for its recipient using `Enc<Shared, u8>` — only the recipient's private key can decrypt it. No one else (including the MXE nodes) learns the card value.

### 3. Community Card Reveal
Community cards are revealed publicly via full MXE decryption. The plaintext value is stored on-chain with an MXE attestation proving correctness.

### 4. Atomic Showdown
At showdown, all hole cards are revealed atomically in a single MXE computation. The on-chain hand evaluator determines the winner, and the pot is settled via USDC+ transfer from the escrow PDA.

### 5. Encrypted Betting (Phase 1)
Bet amounts are transferred as USDC+ (Reflect Protocol) to an escrow PDA, and encrypted bet amounts are stored in the MXE as `Enc<Mxe, u64>`. In Phase 2, this will upgrade to Arcium's Confidential SPL (C-SPL) tokens.

## 🏗️ Building New Card Games

CerberusPoker is game-agnostic! To build a new card game (e.g., Blackjack):

1. **Use `cerberus_poker` as-is** for shuffle, deal, and reveal
2. **Create a new program** (like `texas_holdem`) for your game logic
3. **Call `cerberus_poker` via CPI** for card operations
4. **Use the SDK modules** (`@cerberus-poker/core` + `@cerberus-poker/deck`) in your frontend

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design rationale.

## 📄 License

MIT
