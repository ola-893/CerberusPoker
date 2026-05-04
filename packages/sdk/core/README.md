# @cerberus-poker/core

Core SDK for CerberusPoker — wallet adapter, transaction builder, event subscriptions.

## Features

- **Wallet Adapter Integration**: Seamless support for Phantom and Backpack wallets
- **Transaction Builder**: Helper utilities for building, signing, and sending transactions
- **Event Subscriptions**: Real-time game state, card reveal, and betting action events
- **Type-Safe**: Full TypeScript definitions with comprehensive JSDoc comments
- **React Compatible**: Works seamlessly with `@solana/wallet-adapter-react`

## Installation

```bash
npm install @cerberus-poker/core
```

## Quick Start

### Basic Usage

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import {
  CerberusPokerSDK,
  WalletManager,
  WalletType,
  getWalletAdapter,
} from '@cerberus-poker/core';

// Create wallet manager
const manager = new WalletManager();

// Connect to Phantom wallet
const adapter = await getWalletAdapter(WalletType.Phantom);
const wallet = await manager.connect(adapter);

// Create SDK
const sdk = await CerberusPokerSDK.create({
  connection: new Connection('https://api.devnet.solana.com'),
  wallet,
  programId: new PublicKey('YourProgramId...'),
  clusterOffset: 456, // devnet
});

// Subscribe to game events
sdk.onGameStateChange(gameId, (state) => {
  console.log('Game state:', state);
});

// Use the SDK
// await sdk.deck.shuffleDeck(gameId);
// await sdk.wager.placeBet(gameId, 1000n);
```

### React Integration

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { CerberusPokerSDK } from '@cerberus-poker/core';

function PokerApp() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  
  const sdk = useMemo(async () => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return null;
    }
    
    const wallet = { publicKey, signTransaction, signAllTransactions };
    
    return await CerberusPokerSDK.create({
      connection: new Connection('https://api.devnet.solana.com'),
      wallet,
      programId: new PublicKey('YourProgramId...'),
      clusterOffset: 456,
    });
  }, [publicKey, signTransaction, signAllTransactions]);
  
  return (
    <div>
      <WalletMultiButton />
      {sdk && <PokerGame sdk={sdk} />}
    </div>
  );
}
```

## Wallet Adapter Integration

### Supported Wallets

- **Phantom** - https://phantom.app/
- **Backpack** - https://backpack.app/

### Wallet Detection

Check which wallets are available before connecting:

```typescript
import { detectAvailableWallets } from '@cerberus-poker/core';

const available = detectAvailableWallets();

if (available.phantom) {
  console.log('Phantom is installed');
}

if (available.backpack) {
  console.log('Backpack is installed');
}
```

### Connection Management

The `WalletManager` class provides a high-level API for managing wallet connections:

```typescript
import { WalletManager, WalletConnectionState } from '@cerberus-poker/core';

const manager = new WalletManager();

// Listen for state changes
manager.onStateChange((state) => {
  switch (state) {
    case WalletConnectionState.Disconnected:
      console.log('Wallet disconnected');
      break;
    case WalletConnectionState.Connecting:
      console.log('Connecting...');
      break;
    case WalletConnectionState.Connected:
      console.log('Connected!');
      break;
    case WalletConnectionState.Disconnecting:
      console.log('Disconnecting...');
      break;
  }
});

// Listen for errors
manager.onError((error) => {
  console.error('Wallet error:', error);
});

// Connect
const adapter = await getWalletAdapter(WalletType.Phantom);
const wallet = await manager.connect(adapter);

// Disconnect
await manager.disconnect();
```

### Direct Adapter Usage

You can also use wallet adapters directly without the manager:

```typescript
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { createAnchorWallet } from '@cerberus-poker/core';

const adapter = new PhantomWalletAdapter();
await adapter.connect();

const wallet = createAnchorWallet(adapter);

const sdk = await CerberusPokerSDK.create({
  connection,
  wallet,
  programId,
  clusterOffset: 456,
});
```

## Event Subscriptions

Subscribe to real-time game events:

```typescript
// Game state changes
const unsubscribe1 = sdk.onGameStateChange(gameId, (state) => {
  console.log('Game state:', state);
});

// Card reveals
const unsubscribe2 = sdk.onCardRevealed(gameId, (card) => {
  console.log('Card revealed:', card.cardValue);
});

// Betting actions
const unsubscribe3 = sdk.onBettingAction(gameId, (event) => {
  console.log(`Player ${event.playerIndex} ${event.action}`);
});

// Unsubscribe when done
unsubscribe1();
unsubscribe2();
unsubscribe3();
```

## Transaction Builder

Build, sign, and send transactions:

```typescript
// Transaction builder is available on the SDK instance
const txBuilder = sdk.txBuilder;

// Build and send a transaction
const signature = await txBuilder.buildAndSend(
  async (provider) => {
    // Build your transaction here
    return await program.methods
      .createGame(gameId, maxPlayers, deckSize)
      .accounts({ /* ... */ })
      .transaction();
  },
  { commitment: 'confirmed' }
);

console.log('Transaction signature:', signature);
```

## API Reference

### CerberusPokerSDK

Main SDK class that composes all modules.

```typescript
class CerberusPokerSDK {
  static async create(config: SDKConfig): Promise<CerberusPokerSDK>
  static detectWallets(): { phantom: boolean; backpack: boolean }
  static createWalletManager(): WalletManager
  
  onGameStateChange(gameId: bigint, callback: (state: GameState) => void): Unsubscribe
  onCardRevealed(gameId: bigint, callback: (card: RevealedCard) => void): Unsubscribe
  onBettingAction(gameId: bigint, callback: (event: BettingEvent) => void): Unsubscribe
  
  getGameSessionPda(gameId: bigint): [PublicKey, number]
  getPokerTablePda(gameId: bigint): [PublicKey, number]
  getGameSession(gameId: bigint): Promise<GameSession>
  getPokerTable(gameId: bigint): Promise<PokerTable>
  
  close(): void
}
```

### WalletManager

High-level wallet connection management.

```typescript
class WalletManager {
  getState(): WalletConnectionState
  getAdapter(): WalletAdapter | null
  getWallet(): AnchorWallet | null
  isConnected(): boolean
  
  onStateChange(callback: (state: WalletConnectionState) => void): () => void
  onError(callback: (error: Error) => void): () => void
  
  connect(adapter: WalletAdapter): Promise<AnchorWallet>
  disconnect(): Promise<void>
}
```

### Helper Functions

```typescript
// Detect available wallets
function detectAvailableWallets(): {
  phantom: boolean;
  backpack: boolean;
}

// Get wallet adapter by type
function getWalletAdapter(type: WalletType): Promise<WalletAdapter>

// Create AnchorWallet from adapter
function createAnchorWallet(adapter: WalletAdapter): AnchorWallet
```

## Documentation

- [Wallet Adapter Guide](./WALLET_ADAPTER_GUIDE.md) - Comprehensive wallet integration guide
- [Examples](./examples/) - Code examples for common use cases

## Development

```bash
# Build
npm run build

# Test
npm run test

# Lint
npm run lint

# Clean
npm run clean
```

## License

MIT
