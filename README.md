# CerberusPoker

> Trustless multiplayer card games with complete information privacy on Solana.
> No dealer. No server. Just math.

CerberusPoker is a Solana SDK that bundles two privacy primitives into one composable package:

- **`@cerberus-poker/deck`** — encrypted card operations via [Arcium](https://arcium.com) MPC (Cerberus protocol). Shuffle, deal, and reveal cards with no player ever seeing what they shouldn't.
- **`@cerberus-poker/wager`** — confidential wagering with a two-phase strategy: Phase 1 uses MXE-encrypted amounts + USDC+ escrow (buildable now), Phase 2 will use Arcium's Confidential SPL tokens when available (full end-to-end encryption). See [C-SPL Upgrade Path](packages/sdk/wager/C-SPL-UPGRADE-PATH.md) for details.

The core guarantee: **before showdown, nobody — not opponents, not validators, not MEV bots — sees your cards or your bets.** At showdown, everything is revealed atomically and verified on-chain.

Texas Hold'em ships as the reference implementation. Any card game with a shared deck (Blackjack, Bridge, UNO, Truco) can plug into the same shuffle/deal/reveal/wager layer by swapping only the game logic on top.

---

## Why This Is Only Possible on Solana

Mental Poker is the canonical Multi-Party Computation thought experiment, invented by Shamir, Rivest, and Adleman in 1979. CerberusPoker is the first implementation to solve it using **actual MPC** on a public blockchain:

- **Arcium** launched mainnet in February 2026 — the first decentralised MPC network on Solana
- **Cerberus protocol** provides dishonest-majority security — secure even if all players except one are actively malicious
- **Confidential SPL** provides encrypted token transfers — bet amounts hidden at the protocol level
- Solana's sub-second finality makes the multi-round betting flow practical

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (@cerberus-poker/sdk)                               │
│  deck module          wager module         core             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Solana transactions
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   Arcium MXE       cerberus_poker    Confidential
   (Cerberus MPC)   texas_holdem      SPL Token
   shuffle/deal/    game state        encrypted
   reveal           hand evaluation   balances
```

---

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) 1.75+
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 1.18+
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30+
- [Node.js](https://nodejs.org/) 20+

### Setup

```bash
# Install dependencies
npm install

# Build all Solana programs
make build

# Run tests
make test

# Deploy to devnet
make deploy-devnet
```

---

## Project Structure

```
cerberus-poker/
├── packages/
│   ├── sdk/
│   │   ├── core/        # @cerberus-poker/core — SDK entry point, wallet, events
│   │   ├── deck/        # @cerberus-poker/deck — shuffle, deal, reveal
│   │   └── wager/       # @cerberus-poker/wager — bet, call, fold, settle
│   └── programs/        # Solana programs (Anchor/Rust)
│       └── programs/
│           ├── cerberus_poker/   # Game-agnostic protocol program
│           └── texas_holdem/     # Texas Hold'em reference implementation
├── mxe/                 # Arcium MXE program (confidential compute)
└── examples/
    └── poker-ui/        # React frontend — playable Texas Hold'em demo
```

---

## Building a New Card Game

CerberusPoker is game-agnostic. To build Blackjack on top of it:

1. Deploy your own Solana program that calls `cerberus_poker` via CPI
2. Use `@cerberus-poker/deck` for shuffle/deal/reveal
3. Optionally use `@cerberus-poker/wager` for confidential betting
4. Implement your game rules — the privacy layer is handled for you

See `ARCHITECTURE.md` for a detailed walkthrough.

---

## License

MIT
