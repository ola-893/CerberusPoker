# Wallet Adapter Integration Guide

This guide explains how to integrate Phantom and Backpack wallets with the CerberusPoker SDK.

## Overview

The `@cerberus-poker/core` package provides comprehensive wallet adapter support for Phantom and Backpack wallets. The integration follows Solana wallet adapter best practices and is fully compatible with `@solana/wallet-adapter-react`.

## Supported Wallets

- **Phantom** - Popular Solana wallet with browser extension and mobile app
- **Backpack** - Multi-chain wallet with Solana support

## Installation

The wallet adapter dependencies are included in `@cerberus-poker/core`:

```bash
npm install @cerberus-poker/core
```

## Usage Patterns

### Pattern 1: Direct Wallet Adapter Usage

Use this pattern when you already have a wallet adapter instance (e.g., from a React context):

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { CerberusPokerSDK, createAnchorWallet } from '@cerberus-poker/core';

// Create and connect wallet adapter
const adapter = new PhantomWalletAdapter();
await adapter.connect();

// Wrap in AnchorWallet interface
const wallet = createAnchorWallet(adapter);

// Create SDK
const sdk = await CerberusPokerSDK.create({
  connection: new Connection('https://api.devnet.solana.com'),
  wallet,
  programId: new PublicKey('YourProgramId...'),
  clusterOffset: 456, // devnet
});
```

### Pattern 2: Using WalletManager

Use this pattern for a higher-level API with connection state management:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  CerberusPokerSDK, 
  WalletManager, 
  WalletType,
  getWalletAdapter,
  WalletConnectionState 
} from '@cerberus-poker/core';

// Create wallet manager
const manager = new WalletManager();

// Listen for state changes
manager.onStateChange((state) => {
  console.log('Wallet state:', state);
  if (state === WalletConnectionState.Connected) {
    console.log('Wallet connected!');
  }
});

// Listen for errors
manager.onError((error) => {
  console.error('Wallet error:', error);
});

// Get wallet adapter (automatically detects if wallet is installed)
const adapter = await getWalletAdapter(WalletType.Phantom);

// Connect
const wallet = await manager.connect(adapter);

// Create SDK
const sdk = await CerberusPokerSDK.create({
  connection: new Connection('https://api.devnet.solana.com'),
  wallet,
  programId: new PublicKey('YourProgramId...'),
  clusterOffset: 456,
});

// Later, disconnect
await manager.disconnect();
```

### Pattern 3: Using SDK Static Helpers

Use this pattern for the most convenient API:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  CerberusPokerSDK, 
  WalletType,
  getWalletAdapter 
} from '@cerberus-poker/core';

// Detect available wallets
const available = CerberusPokerSDK.detectWallets();
if (!available.phantom && !available.backpack) {
  throw new Error('No supported wallet found');
}

// Create wallet manager
const manager = CerberusPokerSDK.createWalletManager();

// Connect to Phantom
const adapter = await getWalletAdapter(WalletType.Phantom);
const wallet = await manager.connect(adapter);

// Create SDK
const sdk = await CerberusPokerSDK.create({
  connection: new Connection('https://api.devnet.solana.com'),
  wallet,
  programId: new PublicKey('YourProgramId...'),
  clusterOffset: 456,
});
```

## React Integration

The SDK is fully compatible with `@solana/wallet-adapter-react`. Here's how to use it in a React app:

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { CerberusPokerSDK, createAnchorWallet } from '@cerberus-poker/core';

function PokerApp() {
  const { wallet, publicKey, signTransaction, signAllTransactions } = useWallet();
  
  const sdk = useMemo(async () => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return null;
    }
    
    // Create AnchorWallet from React wallet context
    const anchorWallet = {
      publicKey,
      signTransaction,
      signAllTransactions,
    };
    
    return await CerberusPokerSDK.create({
      connection: new Connection('https://api.devnet.solana.com'),
      wallet: anchorWallet,
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

## Wallet Detection

Check which wallets are available before attempting to connect:

```typescript
import { detectAvailableWallets } from '@cerberus-poker/core';

const available = detectAvailableWallets();

if (available.phantom) {
  console.log('Phantom is installed');
  console.log('Install from: https://phantom.app/');
}

if (available.backpack) {
  console.log('Backpack is installed');
  console.log('Install from: https://backpack.app/');
}

if (!available.phantom && !available.backpack) {
  // Show wallet installation instructions
  console.log('No supported wallet found. Please install Phantom or Backpack.');
}
```

## Error Handling

Always handle wallet connection errors gracefully:

```typescript
import { WalletManager, WalletType, getWalletAdapter } from '@cerberus-poker/core';

const manager = new WalletManager();

// Listen for errors
manager.onError((error) => {
  if (error.message.includes('User rejected')) {
    console.log('User cancelled the connection');
  } else if (error.message.includes('not installed')) {
    console.log('Wallet is not installed');
  } else {
    console.error('Wallet error:', error);
  }
});

try {
  const adapter = await getWalletAdapter(WalletType.Phantom);
  const wallet = await manager.connect(adapter);
  console.log('Connected:', wallet.publicKey.toBase58());
} catch (error) {
  console.error('Failed to connect:', error);
}
```

## Connection State Management

Track wallet connection state for UI updates:

```typescript
import { WalletManager, WalletConnectionState } from '@cerberus-poker/core';

const manager = new WalletManager();

manager.onStateChange((state) => {
  switch (state) {
    case WalletConnectionState.Disconnected:
      console.log('Wallet disconnected');
      // Update UI: show "Connect Wallet" button
      break;
      
    case WalletConnectionState.Connecting:
      console.log('Connecting to wallet...');
      // Update UI: show loading spinner
      break;
      
    case WalletConnectionState.Connected:
      console.log('Wallet connected');
      // Update UI: show wallet address and "Disconnect" button
      break;
      
    case WalletConnectionState.Disconnecting:
      console.log('Disconnecting...');
      // Update UI: show loading spinner
      break;
  }
});
```

## Best Practices

### 1. Always Check Wallet Availability

```typescript
const available = CerberusPokerSDK.detectWallets();
if (!available.phantom) {
  // Show installation instructions
  window.open('https://phantom.app/', '_blank');
}
```

### 2. Handle User Rejection

```typescript
try {
  await manager.connect(adapter);
} catch (error) {
  if (error.message.includes('User rejected')) {
    // User cancelled - don't show error, just log
    console.log('User cancelled connection');
  } else {
    // Real error - show to user
    alert('Failed to connect wallet: ' + error.message);
  }
}
```

### 3. Clean Up on Unmount

```typescript
// In React:
useEffect(() => {
  const manager = new WalletManager();
  // ... use manager
  
  return () => {
    manager.disconnect();
  };
}, []);
```

### 4. Verify Connection Before SDK Creation

```typescript
const adapter = await getWalletAdapter(WalletType.Phantom);
const wallet = await manager.connect(adapter);

// Verify we have a public key
if (!wallet.publicKey) {
  throw new Error('Wallet connected but no public key available');
}

// Now safe to create SDK
const sdk = await CerberusPokerSDK.create({
  connection,
  wallet,
  programId,
  clusterOffset: 456,
});
```

## API Reference

### `WalletAdapterWrapper`

Wraps a standard Solana wallet adapter to implement the `AnchorWallet` interface.

```typescript
class WalletAdapterWrapper implements AnchorWallet {
  constructor(adapter: WalletAdapter);
  get publicKey(): PublicKey;
  signTransaction<T>(tx: T): Promise<T>;
  signAllTransactions<T>(txs: T[]): Promise<T[]>;
}
```

### `WalletManager`

High-level API for managing wallet connections.

```typescript
class WalletManager {
  getState(): WalletConnectionState;
  getAdapter(): WalletAdapter | null;
  getWallet(): AnchorWallet | null;
  isConnected(): boolean;
  onStateChange(callback: (state: WalletConnectionState) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  connect(adapter: WalletAdapter): Promise<AnchorWallet>;
  disconnect(): Promise<void>;
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

### Enums

```typescript
enum WalletType {
  Phantom = 'Phantom',
  Backpack = 'Backpack',
}

enum WalletConnectionState {
  Disconnected = 'Disconnected',
  Connecting = 'Connecting',
  Connected = 'Connected',
  Disconnecting = 'Disconnecting',
}
```

## Troubleshooting

### "Wallet not connected" error

Make sure to await the connection before creating the SDK:

```typescript
const wallet = await manager.connect(adapter);
// Now wallet is connected
const sdk = await CerberusPokerSDK.create({ wallet, ... });
```

### "Wallet does not support transaction signing" error

This means the wallet adapter doesn't implement `signTransaction`. All supported wallets (Phantom, Backpack) support this, so this usually means the wallet isn't properly connected.

### "Already connected to a different wallet" error

Disconnect the current wallet before connecting to a new one:

```typescript
await manager.disconnect();
const newWallet = await manager.connect(newAdapter);
```

## Examples

See the `examples/poker-ui` directory for a complete React application demonstrating wallet integration with the CerberusPoker SDK.
