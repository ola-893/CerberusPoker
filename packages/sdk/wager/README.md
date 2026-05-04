# @cerberus-poker/wager

Confidential wagering module for CerberusPoker. Enables hidden bet amounts and private stack sizes for multiplayer card games on Solana.

## Overview

The wager module provides a clean TypeScript API for confidential betting operations. It implements a **two-phase strategy** to handle the current unavailability of Arcium's Confidential SPL (C-SPL) tokens:

- **Phase 1 (Current)**: MXE-encrypted amounts + USDC+ escrow
- **Phase 2 (Future)**: Full C-SPL confidential transfers

The SDK interface is **identical** in both phases, enabling a seamless upgrade path when C-SPL becomes available.

## Installation

```bash
npm install @cerberus-poker/wager
```

## Quick Start

```typescript
import { WagerModule } from '@cerberus-poker/wager';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';

// Initialize the wager module
const wager = new WagerModule({
  connection: new Connection('https://api.devnet.solana.com'),
  wallet: yourWallet,
  tableProgram: yourTexasHoldemProgram,
  usdcPlusMint: USDC_PLUS_MINT_ADDRESS,
  usdcMint: USDC_MINT_ADDRESS,
  arciumProgramId: ARCIUM_PROGRAM_ID,
  clusterOffset: 456, // devnet
});

// Place a bet of 100 USDC+ (100_000_000 lamports)
const gameId = 12345n;
const amount = 100_000_000n;
const playerIndex = 0;

const signature = await wager.placeBet(gameId, amount, playerIndex);
console.log('Bet placed:', signature);

// Call the current bet
await wager.callBet(gameId);

// Fold your hand
await wager.fold(gameId);

// Settle the pot at showdown
await wager.settleShowdown(gameId);
```

## Features

### Phase 1: MXE-Encrypted Amounts (Current)

- ✅ **Hidden bet amounts**: Stored as `Enc<Mxe, u64>` in Arcium MXE
- ✅ **USDC+ integration**: Yield-bearing stablecoin via Reflect Protocol
- ✅ **Escrow PDA**: Secure fund custody during gameplay
- ✅ **Automatic minting**: SDK mints USDC+ from USDC if needed
- ⚠️ **Visible transfers**: SPL transfers are plaintext on-chain
- ⚠️ **Visible pot total**: Escrow balance is publicly visible

### Phase 2: C-SPL Confidential Transfers (Future)

- ✅ **End-to-end encryption**: All amounts hidden on-chain
- ✅ **MEV resistance**: No observable amounts in mempool
- ✅ **Hidden stack sizes**: Encrypted C-SPL balances
- ✅ **Hidden pot total**: Encrypted pot account
- ✅ **50% cheaper**: Fewer transactions, no MXE overhead

See [C-SPL-UPGRADE-PATH.md](./C-SPL-UPGRADE-PATH.md) for detailed comparison and migration guide.

## API Reference

### `WagerModule`

Main class for confidential betting operations.

#### Constructor

```typescript
new WagerModule(config: WagerModuleConfig)
```

**Parameters:**

- `config.connection`: Solana connection
- `config.wallet`: User's wallet (Phantom, Backpack, etc.)
- `config.tableProgram`: Texas Hold'em program instance
- `config.usdcPlusMint`: USDC+ mint address (Reflect Protocol)
- `config.usdcMint`: USDC mint address (for minting USDC+)
- `config.arciumProgramId`: Arcium program ID
- `config.clusterOffset`: Arcium cluster offset (456 for devnet, 2026 for mainnet)

#### Methods

##### `placeBet(gameId, amount, playerIndex)`

Place a bet: mint USDC+ if needed, then transfer to escrow.

```typescript
async placeBet(
  gameId: bigint,
  amount: bigint,
  playerIndex: number
): Promise<TransactionSignature>
```

**Parameters:**

- `gameId`: Unique identifier for the game
- `amount`: Bet amount in lamports (e.g., 100_000_000 = 100 USDC+)
- `playerIndex`: Index of the player placing the bet (0-9)

**Returns:** Transaction signature

**Throws:**

- `Error` if the player doesn't have enough USDC to mint USDC+
- `Error` if the transaction fails

**Example:**

```typescript
// Place a bet of 50 USDC+ (50_000_000 lamports)
const sig = await wager.placeBet(gameId, 50_000_000n, 0);
console.log('Bet placed:', sig);
```

##### `callBet(gameId)`

Call the current bet - matches the bet amount without revealing stack size.

```typescript
async callBet(gameId: bigint): Promise<TransactionSignature>
```

**Parameters:**

- `gameId`: Unique identifier for the game

**Returns:** Transaction signature

##### `fold(gameId)`

Fold - exits the hand without revealing held cards or remaining stack.

```typescript
async fold(gameId: bigint): Promise<TransactionSignature>
```

**Parameters:**

- `gameId`: Unique identifier for the game

**Returns:** Transaction signature

##### `settleShowdown(gameId)`

Settle pot to winner - atomic transfer triggered by showdown result.

```typescript
async settleShowdown(gameId: bigint): Promise<TransactionSignature>
```

**Parameters:**

- `gameId`: Unique identifier for the game

**Returns:** Transaction signature

##### `getEncryptedBalance(playerPubkey)`

Get encrypted balance for a player.

```typescript
async getEncryptedBalance(playerPubkey: PublicKey): Promise<Uint8Array>
```

**Parameters:**

- `playerPubkey`: Player's public key

**Returns:** Encrypted balance ciphertext

**Note:** Only the player can decrypt this value using their private key.

## Architecture

### Phase 1 Flow

```
Player Wallet (USDC+)
    │
    │ placeBet(amount)
    │ (plaintext SPL transfer)
    ▼
Escrow PDA (USDC+)
    │
    │ queue_computation(amount)
    ▼
Arcium MXE
    │
    │ Enc<Mxe, u64> bet_amounts[10]
    │ (encrypted per player)
    ▼
Showdown → Winner receives pot
```

### Phase 2 Flow (Future)

```
Player Wallet (C-SPL)
    │
    │ placeBet(amount)
    │ (confidential transfer — amount encrypted)
    ▼
Pot PDA (C-SPL)
    │
    │ (no MXE computation needed)
    ▼
Showdown → Winner receives pot (confidential transfer)
```

## Privacy Guarantees

### What is Hidden (Phase 1)

- ✅ Individual bet amounts (encrypted in MXE state)
- ✅ Pot contributions per player (encrypted in MXE)

### What is Visible (Phase 1)

- ❌ Transfer amounts (standard SPL transfers are plaintext)
- ❌ Total pot balance (escrow PDA balance is visible)
- ❌ Winner payout (settlement transfer is plaintext)

### What is Hidden (Phase 2)

- ✅ **Everything**: All amounts are encrypted end-to-end

See [C-SPL-UPGRADE-PATH.md](./C-SPL-UPGRADE-PATH.md) for detailed privacy analysis.

## Integration with Reflect Protocol

The wager module uses **USDC+ (Reflect Protocol)** as the betting token. USDC+ is a yield-bearing stablecoin — players' buy-ins earn yield while the game runs.

### Why USDC+?

- **Yield replaces rake**: The winner takes a pot that has grown during play
- **Standard SPL token**: Works with existing escrow PDA patterns
- **Sponsor integration**: Demonstrates Reflect SDK usage

### Automatic Minting

The SDK automatically mints USDC+ from USDC if the player doesn't have enough balance:

```typescript
// If player has 50 USDC+ but wants to bet 100 USDC+:
// 1. SDK checks balance (50 USDC+)
// 2. SDK mints 50 USDC+ from player's USDC
// 3. SDK transfers 100 USDC+ to escrow
await wager.placeBet(gameId, 100_000_000n, 0);
```

## Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires devnet)
npm run test:integration
```

## C-SPL Upgrade Path

The wager module is designed to be **C-SPL-compatible**. When Arcium's Confidential SPL Token standard becomes available, the backend will be swapped to use confidential transfers while keeping the same SDK interface.

**For developers:** No code changes required when upgrading from Phase 1 to Phase 2. Simply update your configuration to use the C-SPL mint instead of the USDC+ mint.

**For detailed migration guide, see [C-SPL-UPGRADE-PATH.md](./C-SPL-UPGRADE-PATH.md).**

## Examples

### Full Game Flow

```typescript
import { WagerModule } from '@cerberus-poker/wager';

// Initialize
const wager = new WagerModule({ /* config */ });
const gameId = 12345n;

// Pre-flop betting
await wager.placeBet(gameId, 10_000_000n, 0); // Small blind: 10 USDC+
await wager.placeBet(gameId, 20_000_000n, 1); // Big blind: 20 USDC+
await wager.callBet(gameId);                   // Player 2 calls
await wager.placeBet(gameId, 60_000_000n, 3);  // Player 3 raises to 60 USDC+
await wager.fold(gameId);                      // Player 0 folds

// Flop betting
await wager.placeBet(gameId, 100_000_000n, 1); // Player 1 bets 100 USDC+
await wager.callBet(gameId);                   // Player 3 calls

// Turn betting
await wager.placeBet(gameId, 200_000_000n, 1); // Player 1 bets 200 USDC+
await wager.callBet(gameId);                   // Player 3 calls

// River betting
await wager.placeBet(gameId, 500_000_000n, 1); // Player 1 bets 500 USDC+
await wager.callBet(gameId);                   // Player 3 calls

// Showdown
await wager.settleShowdown(gameId);            // Winner receives pot
```

### Error Handling

```typescript
try {
  await wager.placeBet(gameId, 1000_000_000n, 0);
} catch (error) {
  if (error.message.includes('insufficient funds')) {
    console.error('Not enough USDC to mint USDC+');
  } else if (error.message.includes('not your turn')) {
    console.error('Wait for your turn to act');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/cerberus-poker/cerberus-poker) for contribution guidelines.

## License

MIT

## Links

- [CerberusPoker GitHub](https://github.com/cerberus-poker/cerberus-poker)
- [Arcium Documentation](https://docs.arcium.com)
- [Reflect Protocol](https://reflect.finance)
- [C-SPL Upgrade Path](./C-SPL-UPGRADE-PATH.md)

---

**Version**: 1.0.0  
**Last Updated**: April 2026
