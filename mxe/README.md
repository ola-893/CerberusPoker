# CerberusPoker MXE Program

This directory contains the Arcium MXE (Multiparty eXecution Environment) encrypted instructions for CerberusPoker. The MPC logic is written in **Arcis** (Arcium's Rust framework) and lives in `encrypted-ixs/`.

## Prerequisites

Arcium requires specific versions:
- **Anchor 0.32.1**
- **Solana CLI 2.3.0**
- **Docker & Docker Compose** (for local MPC cluster)

## Installation

```bash
# Install the Arcium toolchain (CLI + Arx node)
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash

# Verify installation
arcium --version
```

## Project Structure

```
mxe/
├── encrypted-ixs/       # Arcis MPC circuits (#[encrypted] modules)
│   ├── shuffle.rs       # Confidential shuffle instruction
│   ├── deal.rs          # Threshold deal instruction
│   └── reveal.rs        # Multi-party reveal + atomic showdown
├── src/
│   ├── lib.rs           # MXE entry point
│   └── types.rs         # Shared types
└── Cargo.toml
```

## Building & Testing

```bash
# Build the MXE (compiles Arcis circuits + Solana program)
arcium build

# Run tests against local cluster (requires Docker)
arcium test

# Run tests against devnet
arcium test --cluster devnet
```

## Deployment

```bash
# Deploy to devnet (requires ~2-5 SOL)
arcium deploy --cluster devnet

# After deployment, update Arcium.toml with the cluster offset:
# [clusters.devnet]
# offset = 456  # devnet cluster offset
```

## Encrypted Instructions

| Instruction | Description |
|-------------|-------------|
| `shuffle_card_slot` | Apply one player's permutation + remask to one card slot |
| `verify_permutation_index` | Verify a permutation index is within deck bounds |
| `deal_card_to_recipient` | Threshold deal — re-encrypt card for specific recipient |
| `reveal_card` | Multi-party reveal of a community card |
| `atomic_showdown` | Reveal all hole cards simultaneously at showdown |

## Security Model

Uses the **Cerberus protocol** — dishonest majority MPC. Secure as long as at least one MXE node is honest. This is the correct choice for adversarial settings (anonymous players with money on the line).

The `Enc<Mxe, T>` type means only the MXE can decrypt — used for the deck state.
The `Enc<Shared, T>` type means the client and MXE share a secret — used for dealt cards (only the recipient can decrypt).
