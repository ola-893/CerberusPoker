/**
 * Example: Wallet Adapter Integration
 * 
 * This example demonstrates how to integrate Phantom and Backpack wallets
 * with the CerberusPoker SDK.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  CerberusPokerSDK,
  WalletManager,
  WalletType,
  WalletConnectionState,
  getWalletAdapter,
  detectAvailableWallets,
  createAnchorWallet,
} from '@cerberus-poker/core';

// ============================================================================
// Example 1: Basic Wallet Connection with WalletManager
// ============================================================================

async function example1_basicConnection() {
  console.log('Example 1: Basic Wallet Connection\n');
  
  // Create wallet manager
  const manager = new WalletManager();
  
  // Listen for state changes
  manager.onStateChange((state) => {
    console.log('Wallet state changed:', state);
  });
  
  // Listen for errors
  manager.onError((error) => {
    console.error('Wallet error:', error.message);
  });
  
  try {
    // Get Phantom wallet adapter
    const adapter = await getWalletAdapter(WalletType.Phantom);
    
    // Connect to wallet
    console.log('Connecting to Phantom...');
    const wallet = await manager.connect(adapter);
    console.log('Connected! Public key:', wallet.publicKey.toBase58());
    
    // Create SDK
    const sdk = await CerberusPokerSDK.create({
      connection: new Connection('https://api.devnet.solana.com'),
      wallet,
      programId: new PublicKey('YourProgramIdHere...'),
      clusterOffset: 456, // devnet
    });
    
    console.log('SDK initialized successfully!');
    
    // Use the SDK...
    // await sdk.deck.shuffleDeck(gameId);
    
    // Disconnect when done
    await manager.disconnect();
    console.log('Disconnected');
    
  } catch (error) {
    console.error('Failed:', error);
  }
}

// ============================================================================
// Example 2: Wallet Detection and Selection
// ============================================================================

async function example2_walletDetection() {
  console.log('Example 2: Wallet Detection and Selection\n');
  
  // Detect available wallets
  const available = detectAvailableWallets();
  console.log('Available wallets:', available);
  
  if (!available.phantom && !available.backpack) {
    console.log('No supported wallet found!');
    console.log('Install Phantom: https://phantom.app/');
    console.log('Install Backpack: https://backpack.app/');
    return;
  }
  
  // Choose wallet based on availability
  const walletType = available.phantom ? WalletType.Phantom : WalletType.Backpack;
  console.log(`Using ${walletType} wallet`);
  
  const manager = new WalletManager();
  
  try {
    const adapter = await getWalletAdapter(walletType);
    const wallet = await manager.connect(adapter);
    console.log('Connected to', walletType, ':', wallet.publicKey.toBase58());
    
    await manager.disconnect();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

// ============================================================================
// Example 3: Direct Wallet Adapter Usage (without WalletManager)
// ============================================================================

async function example3_directAdapter() {
  console.log('Example 3: Direct Wallet Adapter Usage\n');
  
  try {
    // Import wallet adapter directly
    const { PhantomWalletAdapter } = await import('@solana/wallet-adapter-phantom');
    
    // Create and connect adapter
    const adapter = new PhantomWalletAdapter();
    console.log('Connecting to Phantom...');
    await adapter.connect();
    console.log('Connected!');
    
    // Wrap in AnchorWallet interface
    const wallet = createAnchorWallet(adapter);
    console.log('Public key:', wallet.publicKey.toBase58());
    
    // Create SDK
    const sdk = await CerberusPokerSDK.create({
      connection: new Connection('https://api.devnet.solana.com'),
      wallet,
      programId: new PublicKey('YourProgramIdHere...'),
      clusterOffset: 456,
    });
    
    console.log('SDK initialized!');
    
    // Disconnect when done
    await adapter.disconnect();
    console.log('Disconnected');
    
  } catch (error) {
    console.error('Failed:', error);
  }
}

// ============================================================================
// Example 4: Handling Connection Errors
// ============================================================================

async function example4_errorHandling() {
  console.log('Example 4: Error Handling\n');
  
  const manager = new WalletManager();
  
  // Set up error handler
  manager.onError((error) => {
    if (error.message.includes('User rejected')) {
      console.log('User cancelled the connection');
    } else if (error.message.includes('not installed')) {
      console.log('Wallet is not installed');
      console.log('Please install from: https://phantom.app/');
    } else {
      console.error('Unexpected error:', error.message);
    }
  });
  
  try {
    const adapter = await getWalletAdapter(WalletType.Phantom);
    const wallet = await manager.connect(adapter);
    console.log('Connected:', wallet.publicKey.toBase58());
    
    await manager.disconnect();
  } catch (error) {
    // Error already logged by error handler
    console.log('Connection attempt failed');
  }
}

// ============================================================================
// Example 5: State Management for UI
// ============================================================================

async function example5_stateManagement() {
  console.log('Example 5: State Management for UI\n');
  
  const manager = new WalletManager();
  
  // Track state for UI updates
  manager.onStateChange((state) => {
    switch (state) {
      case WalletConnectionState.Disconnected:
        console.log('[UI] Show "Connect Wallet" button');
        break;
        
      case WalletConnectionState.Connecting:
        console.log('[UI] Show loading spinner');
        break;
        
      case WalletConnectionState.Connected:
        console.log('[UI] Show wallet address and "Disconnect" button');
        const wallet = manager.getWallet();
        if (wallet) {
          console.log('[UI] Display address:', wallet.publicKey.toBase58());
        }
        break;
        
      case WalletConnectionState.Disconnecting:
        console.log('[UI] Show loading spinner');
        break;
    }
  });
  
  try {
    const adapter = await getWalletAdapter(WalletType.Phantom);
    await manager.connect(adapter);
    
    // Simulate some delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await manager.disconnect();
  } catch (error) {
    console.error('Failed:', error);
  }
}

// ============================================================================
// Example 6: Using SDK Static Helpers
// ============================================================================

async function example6_sdkHelpers() {
  console.log('Example 6: Using SDK Static Helpers\n');
  
  // Detect wallets using SDK helper
  const available = CerberusPokerSDK.detectWallets();
  console.log('Available wallets:', available);
  
  if (!available.phantom && !available.backpack) {
    console.log('No supported wallet found');
    return;
  }
  
  // Create wallet manager using SDK helper
  const manager = CerberusPokerSDK.createWalletManager();
  
  manager.onStateChange((state) => {
    console.log('State:', state);
  });
  
  try {
    const adapter = await getWalletAdapter(WalletType.Phantom);
    const wallet = await manager.connect(adapter);
    
    const sdk = await CerberusPokerSDK.create({
      connection: new Connection('https://api.devnet.solana.com'),
      wallet,
      programId: new PublicKey('YourProgramIdHere...'),
      clusterOffset: 456,
    });
    
    console.log('SDK ready!');
    
    await manager.disconnect();
  } catch (error) {
    console.error('Failed:', error);
  }
}

// ============================================================================
// Example 7: Switching Between Wallets
// ============================================================================

async function example7_switchingWallets() {
  console.log('Example 7: Switching Between Wallets\n');
  
  const manager = new WalletManager();
  
  try {
    // Connect to Phantom
    console.log('Connecting to Phantom...');
    const phantomAdapter = await getWalletAdapter(WalletType.Phantom);
    const phantomWallet = await manager.connect(phantomAdapter);
    console.log('Connected to Phantom:', phantomWallet.publicKey.toBase58());
    
    // Disconnect from Phantom
    console.log('Disconnecting from Phantom...');
    await manager.disconnect();
    
    // Connect to Backpack
    console.log('Connecting to Backpack...');
    const backpackAdapter = await getWalletAdapter(WalletType.Backpack);
    const backpackWallet = await manager.connect(backpackAdapter);
    console.log('Connected to Backpack:', backpackWallet.publicKey.toBase58());
    
    await manager.disconnect();
    console.log('Done');
    
  } catch (error) {
    console.error('Failed:', error);
  }
}

// ============================================================================
// Example 8: React-like Usage Pattern
// ============================================================================

async function example8_reactPattern() {
  console.log('Example 8: React-like Usage Pattern\n');
  
  // This simulates how you would use the wallet manager in a React app
  
  let manager: WalletManager | null = null;
  let sdk: CerberusPokerSDK | null = null;
  
  // Simulate component mount
  async function onMount() {
    console.log('[Component] Mounting...');
    
    manager = new WalletManager();
    
    manager.onStateChange((state) => {
      console.log('[Component] Wallet state:', state);
      // In React, this would trigger a re-render
    });
    
    manager.onError((error) => {
      console.error('[Component] Wallet error:', error.message);
      // In React, this would show an error toast
    });
  }
  
  // Simulate user clicking "Connect Wallet" button
  async function onConnectClick() {
    console.log('[Component] User clicked Connect Wallet');
    
    if (!manager) return;
    
    try {
      const adapter = await getWalletAdapter(WalletType.Phantom);
      const wallet = await manager.connect(adapter);
      
      // Initialize SDK after wallet connection
      sdk = await CerberusPokerSDK.create({
        connection: new Connection('https://api.devnet.solana.com'),
        wallet,
        programId: new PublicKey('YourProgramIdHere...'),
        clusterOffset: 456,
      });
      
      console.log('[Component] SDK initialized');
    } catch (error) {
      console.error('[Component] Connection failed:', error);
    }
  }
  
  // Simulate user clicking "Disconnect" button
  async function onDisconnectClick() {
    console.log('[Component] User clicked Disconnect');
    
    if (manager) {
      await manager.disconnect();
      sdk = null;
    }
  }
  
  // Simulate component unmount
  async function onUnmount() {
    console.log('[Component] Unmounting...');
    
    if (manager) {
      await manager.disconnect();
      manager = null;
      sdk = null;
    }
  }
  
  // Run the simulation
  await onMount();
  await onConnectClick();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await onDisconnectClick();
  await onUnmount();
}

// ============================================================================
// Run Examples
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('CerberusPoker Wallet Adapter Integration Examples');
  console.log('='.repeat(80));
  console.log();
  
  // Uncomment the example you want to run:
  
  // await example1_basicConnection();
  // await example2_walletDetection();
  // await example3_directAdapter();
  // await example4_errorHandling();
  // await example5_stateManagement();
  // await example6_sdkHelpers();
  // await example7_switchingWallets();
  await example8_reactPattern();
  
  console.log();
  console.log('='.repeat(80));
  console.log('Examples complete!');
  console.log('='.repeat(80));
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_basicConnection,
  example2_walletDetection,
  example3_directAdapter,
  example4_errorHandling,
  example5_stateManagement,
  example6_sdkHelpers,
  example7_switchingWallets,
  example8_reactPattern,
};
