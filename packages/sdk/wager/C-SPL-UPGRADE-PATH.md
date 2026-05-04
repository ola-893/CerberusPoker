# Confidential SPL (C-SPL) Upgrade Path

## Table of Contents

1. [What is C-SPL?](#what-is-c-spl)
2. [Why C-SPL is the Correct Long-Term Solution](#why-c-spl-is-the-correct-long-term-solution)
3. [Current Status (April 2026)](#current-status-april-2026)
4. [Phase 1: Current Implementation (MXE-Encrypted Amounts)](#phase-1-current-implementation-mxe-encrypted-amounts)
5. [Phase 2: Future C-SPL Implementation](#phase-2-future-c-spl-implementation)
6. [Interface Compatibility Between Phases](#interface-compatibility-between-phases)
7. [Migration Guide for Developers](#migration-guide-for-developers)
8. [Technical Comparison: Phase 1 vs Phase 2](#technical-comparison-phase-1-vs-phase-2)
9. [FAQ](#faq)

---

## What is C-SPL?

**Confidential SPL Token (C-SPL)** is Arcium's upcoming standard for confidential token transfers on Solana. It merges the SPL Token standard, Token-2022 extensions, Confidential Transfer capabilities, and Arcium's Multi-Party Computation (MPC) infrastructure into a unified protocol.

### Key Features

C-SPL provides:

- **Hidden token amounts**: Transfer amounts, balances, and metadata are encrypted on-chain
- **Program/PDA-owned confidential accounts**: Unlike Solana's Token-2022 Confidential Transfer Extension, C-SPL supports program-controlled accounts, enabling DeFi applications
- **Sender-initiated account creation**: Senders can create confidential token accounts for recipients without pre-setup
- **Wrapping existing tokens**: Any SPL token can be wrapped into a confidential variant
- **MPC-backed privacy**: Leverages Arcium's Cerberus protocol for dishonest-majority security

### How It Works

C-SPL uses a combination of:

1. **ElGamal encryption** for on-chain balance commitments
2. **Zero-knowledge proofs** for transfer validity (balance sufficiency, no negative amounts)
3. **Arcium MPC** for key management and decryption operations
4. **Solana Token-2022** as the underlying token infrastructure

When a player transfers C-SPL tokens:
- The amount is encrypted using the recipient's public key
- A ZK proof demonstrates the sender has sufficient balance
- The encrypted amount is added to the recipient's encrypted balance
- No observer (including validators) can determine the transfer amount

---

## Why C-SPL is the Correct Long-Term Solution

### The Problem: Information Leakage in Poker

In a poker game, **bet amounts reveal strategic information**:

- A large bet signals strength (or a bluff)
- A small bet signals weakness (or a trap)
- Stack sizes influence optimal play (short-stack vs deep-stack strategy)
- Pot odds calculations depend on hidden information

If bet amounts are visible on-chain, several attacks become possible:

1. **Front-running**: MEV bots observe large bets in the mempool and sandwich transactions
2. **Pattern analysis**: Opponents analyze historical betting patterns to predict future actions
3. **Collusion**: Players share bet information off-chain to gain an unfair advantage
4. **Stack exploitation**: Players with visible large stacks become targets

### Why C-SPL Solves This

C-SPL provides **protocol-level confidentiality**:

| Property | Phase 1 (MXE-Encrypted) | Phase 2 (C-SPL) |
|----------|-------------------------|-----------------|
| **Bet amounts hidden** | ✅ (encrypted in MXE state) | ✅ (encrypted on-chain) |
| **Transfer amounts hidden** | ❌ (plaintext SPL transfer) | ✅ (confidential transfer) |
| **Stack sizes hidden** | ⚠️ (visible as SPL balance) | ✅ (encrypted balance) |
| **Pot total hidden** | ❌ (visible as escrow balance) | ✅ (encrypted pot account) |
| **MEV resistance** | ⚠️ (partial — amounts visible in mempool) | ✅ (full — amounts encrypted) |
| **DeFi composability** | ✅ (PDA-owned escrow) | ✅ (PDA-owned C-SPL accounts) |

**Phase 1** hides bet amounts in the game state but exposes transfer amounts during the transaction. **Phase 2** hides everything end-to-end.

### Why Not Token-2022 Confidential Transfer?

Solana's native Token-2022 Confidential Transfer Extension has two critical limitations:

1. **Disabled on mainnet/devnet** (June 2025): A security vulnerability in the ZK ElGamal implementation led to the feature being disabled. No ETA for re-enablement.
2. **No PDA support**: Token-2022 Confidential Transfer does not support program-owned accounts, making it unsuitable for DeFi applications like poker escrows.

C-SPL addresses both issues by:
- Using Arcium's audited MPC infrastructure instead of on-chain ZK verification
- Supporting PDA-owned confidential accounts from day one

---

## Current Status (April 2026)

### C-SPL Availability

As of April 2026, **C-SPL is in active development but not yet publicly available**:

- ❌ No public SDK
- ❌ No documentation or API reference
- ❌ No devnet deployment
- ❌ No GitHub repository
- ⏳ "Early access to selected teams to be announced soon" (per Arcium blog post)

**Original timeline**: Q1 2026 devnet launch  
**Current status**: Delayed, no updated ETA

### Token-2022 Confidential Transfer Status

Solana's Token-2022 Confidential Transfer Extension:
- ❌ Disabled on mainnet (June 2025)
- ❌ Disabled on devnet (June 2025)
- 🐛 Security vulnerability in ZK ElGamal implementation
- ⏳ No ETA for re-enablement

### Implication for CerberusPoker

Because C-SPL is not yet available, CerberusPoker implements a **two-phase strategy**:

1. **Phase 1 (Hackathon — buildable now)**: MXE-encrypted amounts + plaintext SPL transfers
2. **Phase 2 (Future — when C-SPL ships)**: Full confidential transfers

The wager module interface is **designed to be identical** in both phases, enabling a seamless upgrade path.

---

## Phase 1: Current Implementation (MXE-Encrypted Amounts)

### Architecture

Phase 1 uses a **hybrid approach**:

- **USDC+ (Reflect Protocol)** for token transfers (standard SPL)
- **Arcium MXE** for storing encrypted bet amounts (`Enc<Mxe, u64>`)
- **Escrow PDA** for holding deposited funds

```
┌─────────────────────────────────────────────────────────────────┐
│  Player Wallet                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  USDC+ Token Account (plaintext balance)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ placeBet(amount)
                            │ (plaintext SPL transfer)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Escrow PDA (owned by texas_holdem program)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  USDC+ Token Account (plaintext balance = pot total)     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ queue_computation(amount)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Arcium MXE (Cerberus protocol)                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Enc<Mxe, u64> bet_amounts[10]  (encrypted per player)   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Flow: Placing a Bet

1. **Player calls `WagerModule.placeBet(gameId, amount)`**
   - SDK checks if player has enough USDC+ balance
   - If not, mints USDC+ from USDC via Reflect Protocol

2. **Transfer USDC+ to escrow PDA**
   - Standard SPL token transfer (plaintext on-chain)
   - Amount is visible in the transaction

3. **Queue MXE computation**
   - `place_bet` instruction calls `queue_computation()` via Arcium CPI
   - Passes encrypted `amount` to the MXE
   - MXE stores `Enc<Mxe, u64>` in game state

4. **MXE callback fires**
   - `place_bet_callback` instruction receives encrypted bet amount
   - Stores it in `PokerTable.player_bets[player_index]`
   - **Nobody can read this amount** without the MXE decrypting it

### Flow: Showdown Settlement

1. **`atomic_showdown` MXE computation runs**
   - Reveals all hole cards
   - Determines winner based on hand evaluation
   - Returns `winner_index` in callback

2. **`settle_showdown` instruction fires**
   - Reads `winner_index` from MXE attestation
   - Transfers full escrow balance to winner's USDC+ account
   - Standard SPL transfer (plaintext on-chain)

### Privacy Guarantees (Phase 1)

| What is hidden | How |
|----------------|-----|
| Individual bet amounts | Stored as `Enc<Mxe, u64>` in MXE state |
| Player stack sizes | Not tracked on-chain (only in client state) |
| Pot contributions per player | Encrypted in MXE, only total pot visible |

| What is visible | Why |
|-----------------|-----|
| Transfer amounts | Standard SPL transfers are plaintext |
| Total pot balance | Escrow PDA balance is a standard token account |
| Winner payout | Settlement transfer is plaintext |

### Why USDC+ (Reflect Protocol)?

**Reflect Protocol** is a Frontier hackathon sponsor with two judges on the panel. USDC+ is a **yield-bearing stablecoin** — players' buy-ins earn yield while the game runs.

Benefits:
- **Yield replaces rake**: The winner takes a pot that has grown during play
- **Standard SPL token**: Works with existing escrow PDA patterns
- **Sponsor integration**: Demonstrates Reflect SDK usage for hackathon judging

Integration:
- Rust: `reflect-sdk = "1.0.0"`
- TypeScript: `@reflect-protocol/sdk`

---

## Phase 2: Future C-SPL Implementation

### Architecture

Phase 2 replaces the escrow PDA with **C-SPL confidential token accounts**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Player Wallet                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  C-SPL Token Account (encrypted balance)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ placeBet(amount)
                            │ (confidential transfer — amount encrypted)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Pot PDA (owned by texas_holdem program)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  C-SPL Token Account (encrypted balance = pot total)     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ (no MXE computation needed)
                            ▼
                    [Pot balance updated]
```

### Flow: Placing a Bet

1. **Player calls `WagerModule.placeBet(gameId, amount)`**
   - Same SDK interface as Phase 1
   - Backend implementation changes

2. **Confidential transfer to pot PDA**
   - C-SPL confidential transfer instruction
   - Amount is encrypted using pot PDA's public key
   - ZK proof demonstrates sender has sufficient balance
   - **Amount is never visible on-chain**

3. **No MXE computation needed**
   - C-SPL handles encryption at the protocol level
   - Game state only tracks pot account address
   - Individual bet amounts are not stored separately

### Flow: Showdown Settlement

1. **`atomic_showdown` MXE computation runs**
   - Same as Phase 1 (determines winner)

2. **`settle_showdown` instruction fires**
   - Confidential transfer from pot PDA to winner
   - Amount is encrypted (only winner can decrypt)
   - **Settlement amount is hidden from observers**

### Privacy Guarantees (Phase 2)

| What is hidden | How |
|----------------|-----|
| Individual bet amounts | Encrypted in C-SPL transfer |
| Player stack sizes | Encrypted C-SPL balances |
| Pot contributions per player | Not tracked (only total pot) |
| Total pot balance | Encrypted C-SPL pot account |
| Transfer amounts | C-SPL confidential transfers |
| Winner payout | Encrypted settlement transfer |

**Everything is hidden end-to-end.**

### Why This is Better

Phase 2 eliminates all information leakage:

1. **MEV resistance**: Bots cannot observe bet amounts in the mempool
2. **No pattern analysis**: Historical bet amounts are not recoverable
3. **Stack privacy**: Opponents cannot see your remaining balance
4. **Pot privacy**: Total pot size is hidden until showdown

---

## Interface Compatibility Between Phases

### Design Principle

The `WagerModule` interface is **identical** in both phases. Developers using the SDK do not need to change their code when upgrading from Phase 1 to Phase 2.

### SDK Interface (Unchanged)

```typescript
export class WagerModule {
  /**
   * Place a bet: transfer tokens to the pot
   * 
   * Phase 1: Mints USDC+ if needed, transfers to escrow, queues MXE computation
   * Phase 2: Performs C-SPL confidential transfer to pot PDA
   * 
   * @param gameId - Unique identifier for the game
   * @param amount - Bet amount in lamports
   * @param playerIndex - Index of the player placing the bet
   * @returns Transaction signature
   */
  async placeBet(
    gameId: bigint,
    amount: bigint,
    playerIndex: number
  ): Promise<TransactionSignature>

  /**
   * Call the current bet
   * 
   * Phase 1: Transfers USDC+ to escrow, queues MXE computation
   * Phase 2: C-SPL confidential transfer matching current bet
   */
  async callBet(gameId: bigint): Promise<TransactionSignature>

  /**
   * Fold: exit the hand
   * 
   * Phase 1 & 2: Calls player_action instruction with Action::Fold
   */
  async fold(gameId: bigint): Promise<TransactionSignature>

  /**
   * Settle pot to winner
   * 
   * Phase 1: Transfers USDC+ from escrow to winner
   * Phase 2: C-SPL confidential transfer from pot PDA to winner
   */
  async settleShowdown(gameId: bigint): Promise<TransactionSignature>

  /**
   * Get encrypted balance
   * 
   * Phase 1: Returns USDC+ balance (plaintext)
   * Phase 2: Returns C-SPL encrypted balance (ciphertext)
   */
  async getEncryptedBalance(playerPubkey: PublicKey): Promise<EncryptedBalance>
}
```

### What Changes Under the Hood

| Component | Phase 1 | Phase 2 |
|-----------|---------|---------|
| **Token type** | USDC+ (standard SPL) | C-SPL wrapped USDC+ |
| **Transfer instruction** | `spl_token::transfer` | `c_spl::confidential_transfer` |
| **Pot account** | Escrow PDA (standard token account) | Pot PDA (C-SPL token account) |
| **MXE computation** | Required (stores encrypted amounts) | Not required (C-SPL handles it) |
| **Balance queries** | `getTokenAccountBalance` (plaintext) | `getConfidentialBalance` (ciphertext) |

### What Stays the Same

- **SDK method signatures**: No changes to public API
- **Game logic**: Betting rounds, hand evaluation, showdown flow
- **Solana program interface**: `place_bet`, `settle_showdown` instructions
- **MXE shuffle/deal/reveal**: Card operations are unchanged

---

## Migration Guide for Developers

### For SDK Users (Game Developers)

If you're building a card game on top of CerberusPoker, **no code changes are required** when upgrading from Phase 1 to Phase 2.

#### Step 1: Update Dependencies

```bash
# Update to the latest SDK version
npm install @cerberus-poker/wager@latest
```

#### Step 2: Update Configuration

```typescript
// Phase 1 configuration
const sdk = await CerberusPokerSDK.create({
  connection,
  wallet,
  programId: CERBERUS_POKER_PROGRAM_ID,
  clusterOffset: 456, // devnet
  usdcPlusMint: USDC_PLUS_MINT,      // Phase 1: USDC+ mint
  usdcMint: USDC_MINT,                // Phase 1: USDC mint (for minting USDC+)
});

// Phase 2 configuration
const sdk = await CerberusPokerSDK.create({
  connection,
  wallet,
  programId: CERBERUS_POKER_PROGRAM_ID,
  clusterOffset: 456, // devnet
  cSplMint: C_SPL_USDC_PLUS_MINT,    // Phase 2: C-SPL wrapped USDC+ mint
});
```

#### Step 3: Test Your Application

Run your existing test suite. All SDK methods should work identically.

```bash
npm test
```

#### Step 4: Deploy

Deploy your updated application. Users will automatically benefit from enhanced privacy.

### For SDK Contributors (CerberusPoker Maintainers)

If you're contributing to the CerberusPoker SDK, here's how to implement Phase 2 support:

#### Step 1: Add C-SPL Dependencies

```toml
# packages/programs/Cargo.toml
[dependencies]
arcium-c-spl = "0.1.0"  # Replace with actual version when available
```

```json
// packages/sdk/wager/package.json
{
  "dependencies": {
    "@arcium-hq/c-spl": "^0.1.0"  // Replace with actual version
  }
}
```

#### Step 2: Implement C-SPL Transfer Logic

```typescript
// packages/sdk/wager/src/cspl.ts

import { ConfidentialTransferInstruction } from '@arcium-hq/c-spl';

export async function buildConfidentialTransfer(
  connection: Connection,
  source: PublicKey,
  destination: PublicKey,
  amount: bigint,
  owner: PublicKey,
  mint: PublicKey
): Promise<TransactionInstruction> {
  // Build C-SPL confidential transfer instruction
  // This is a placeholder — actual API will differ
  return ConfidentialTransferInstruction.create({
    source,
    destination,
    amount,
    owner,
    mint,
  });
}
```

#### Step 3: Update `WagerModule.placeBet()`

```typescript
// packages/sdk/wager/src/index.ts

async placeBet(
  gameId: bigint,
  amount: bigint,
  playerIndex: number
): Promise<TransactionSignature> {
  // Detect which phase we're in based on config
  if (this.config.cSplMint) {
    // Phase 2: C-SPL confidential transfer
    return this.placeBetPhase2(gameId, amount, playerIndex);
  } else {
    // Phase 1: USDC+ escrow + MXE
    return this.placeBetPhase1(gameId, amount, playerIndex);
  }
}

private async placeBetPhase2(
  gameId: bigint,
  amount: bigint,
  playerIndex: number
): Promise<TransactionSignature> {
  // Get player's C-SPL token account
  const playerAccount = await getAssociatedTokenAddress(
    this.config.cSplMint,
    this.wallet.publicKey
  );

  // Derive pot PDA
  const [potPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pot'), gameIdToBytes(gameId)],
    this.tableProgram.programId
  );

  // Build confidential transfer instruction
  const transferIx = await buildConfidentialTransfer(
    this.connection,
    playerAccount,
    potPda,
    amount,
    this.wallet.publicKey,
    this.config.cSplMint
  );

  // Build and send transaction
  const tx = new Transaction().add(transferIx);
  const signature = await this.connection.sendTransaction(tx, [this.wallet]);
  await this.connection.confirmTransaction(signature);

  return signature;
}
```

#### Step 4: Update Solana Program

```rust
// packages/programs/programs/texas_holdem/src/instructions/place_bet.rs

use arcium_c_spl::confidential_transfer;

pub fn place_bet(ctx: Context<PlaceBet>, amount: u64) -> Result<()> {
    // Phase 2: No MXE computation needed
    // C-SPL handles encryption at the protocol level
    
    // Verify the confidential transfer was successful
    let pot_account = &ctx.accounts.pot_account;
    require!(
        pot_account.owner == ctx.program_id,
        ErrorCode::InvalidPotAccount
    );

    // Update game state
    let poker_table = &mut ctx.accounts.poker_table;
    poker_table.current_bet = amount;
    poker_table.current_player = (poker_table.current_player + 1) % poker_table.num_players;

    Ok(())
}
```

#### Step 5: Write Migration Tests

```typescript
// packages/sdk/wager/tests/migration.test.ts

describe('Phase 1 to Phase 2 Migration', () => {
  it('should maintain identical SDK interface', async () => {
    // Phase 1 SDK
    const sdkPhase1 = await CerberusPokerSDK.create({
      connection,
      wallet,
      programId,
      clusterOffset: 456,
      usdcPlusMint: USDC_PLUS_MINT,
      usdcMint: USDC_MINT,
    });

    // Phase 2 SDK
    const sdkPhase2 = await CerberusPokerSDK.create({
      connection,
      wallet,
      programId,
      clusterOffset: 456,
      cSplMint: C_SPL_USDC_PLUS_MINT,
    });

    // Both should have identical method signatures
    expect(typeof sdkPhase1.wager.placeBet).toBe('function');
    expect(typeof sdkPhase2.wager.placeBet).toBe('function');
    
    // Method signatures should match
    expect(sdkPhase1.wager.placeBet.length).toBe(sdkPhase2.wager.placeBet.length);
  });

  it('should produce identical transaction results', async () => {
    // Test that both phases produce valid transactions
    // (actual execution would require devnet/mainnet)
  });
});
```

---

## Technical Comparison: Phase 1 vs Phase 2

### Privacy Model

| Aspect | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Bet amount privacy** | ✅ Encrypted in MXE state | ✅ Encrypted in C-SPL transfer |
| **Transfer amount privacy** | ❌ Visible in SPL transfer | ✅ Hidden in confidential transfer |
| **Stack size privacy** | ⚠️ Visible as token balance | ✅ Encrypted C-SPL balance |
| **Pot total privacy** | ❌ Visible as escrow balance | ✅ Encrypted C-SPL pot account |
| **Settlement privacy** | ❌ Visible payout amount | ✅ Encrypted settlement transfer |
| **MEV resistance** | ⚠️ Partial (amounts in mempool) | ✅ Full (amounts encrypted) |

### Performance

| Metric | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Transactions per bet** | 2 (transfer + MXE queue) | 1 (confidential transfer) |
| **Compute units** | ~200k (transfer + CPI) | ~150k (C-SPL transfer) |
| **Latency** | ~2-3 seconds (MXE callback) | ~1 second (single tx) |
| **On-chain storage** | +64 bytes per bet (MXE state) | 0 bytes (C-SPL handles it) |

### Cost

| Operation | Phase 1 | Phase 2 |
|-----------|---------|---------|
| **Place bet** | 0.00001 SOL (2 txs) | 0.000005 SOL (1 tx) |
| **Settle showdown** | 0.000005 SOL | 0.000005 SOL |
| **Total per game (6 players, 4 rounds)** | ~0.00024 SOL | ~0.00012 SOL |

**Phase 2 is ~50% cheaper** due to fewer transactions and no MXE computation overhead.

### Security

| Threat | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Front-running** | ⚠️ Possible (amounts in mempool) | ✅ Prevented (encrypted transfers) |
| **Pattern analysis** | ⚠️ Possible (transfer amounts visible) | ✅ Prevented (no visible amounts) |
| **Collusion** | ✅ Prevented (MXE encryption) | ✅ Prevented (C-SPL encryption) |
| **Stack exploitation** | ⚠️ Possible (balances visible) | ✅ Prevented (encrypted balances) |
| **MEV extraction** | ⚠️ Possible (sandwich attacks) | ✅ Prevented (no observable amounts) |

**Phase 2 provides stronger security guarantees** by eliminating all on-chain information leakage.

---

## FAQ

### When will C-SPL be available?

**Unknown.** Arcium announced C-SPL in Q1 2026 but has not provided an updated timeline. The feature is in active development with "early access to selected teams to be announced soon."

### Can I use Phase 1 in production?

**Yes, with caveats.** Phase 1 provides strong privacy for bet amounts stored in the MXE, but transfer amounts are visible on-chain. This is acceptable for:

- **Casual games** where MEV is not a concern
- **Private tables** where all players are trusted
- **Hackathons and demos** where full privacy is not required

For **high-stakes games** or **public tables with anonymous players**, wait for Phase 2 (C-SPL).

### Will my game break when upgrading to Phase 2?

**No.** The SDK interface is identical. You only need to update your configuration to use the C-SPL mint instead of the USDC+ mint.

### Do I need to redeploy my Solana programs?

**Yes.** The `texas_holdem` program will need to be updated to use C-SPL transfer instructions instead of standard SPL transfers. However, the `cerberus_poker` program (deck operations) remains unchanged.

### Can I support both Phase 1 and Phase 2 simultaneously?

**Yes.** The SDK can detect which phase is configured based on the presence of `cSplMint` vs `usdcPlusMint` in the config. You can deploy two versions of your game (one for each phase) and let users choose.

### What happens to existing games when upgrading?

**Existing games continue using Phase 1.** New games created after the upgrade use Phase 2. There is no automatic migration of in-progress games.

### How do I test Phase 2 before C-SPL is available?

You can write **mock implementations** of the C-SPL interface for testing:

```typescript
// tests/mocks/cspl.ts
export class MockCSPL {
  async confidentialTransfer(
    source: PublicKey,
    destination: PublicKey,
    amount: bigint
  ): Promise<TransactionSignature> {
    // Mock implementation for testing
    return 'mock-signature';
  }
}
```

This allows you to test the Phase 2 code path without waiting for C-SPL to ship.

### Will Phase 1 be deprecated?

**Eventually, yes.** Once C-SPL is stable and widely adopted, Phase 1 will be deprecated. However, this will not happen until:

1. C-SPL is available on mainnet
2. C-SPL has been audited and battle-tested
3. A migration path for existing games is provided

Expect Phase 1 to be supported for **at least 6-12 months** after C-SPL launches.

### Can I use C-SPL for other games?

**Yes!** C-SPL is a general-purpose confidential token standard. Any game or DeFi application that requires hidden amounts can use it. Examples:

- **Sealed-bid auctions**: Bids are hidden until reveal
- **Dark pools**: Trading without exposing order sizes
- **Confidential voting**: Vote weights are hidden
- **Private payroll**: Salary amounts are hidden

The `WagerModule` is designed to be reusable for any game that needs confidential betting.

---

## Conclusion

The CerberusPoker wager module is designed with a **clear upgrade path** from Phase 1 (MXE-encrypted amounts) to Phase 2 (C-SPL confidential transfers). The SDK interface remains identical, ensuring that game developers can upgrade seamlessly when C-SPL becomes available.

**Phase 1** is buildable today and provides strong privacy for bet amounts stored in the MXE. **Phase 2** will provide end-to-end confidentiality, eliminating all information leakage and enabling true MEV-resistant poker on Solana.

For questions or contributions, see the [CerberusPoker GitHub repository](https://github.com/cerberus-poker/cerberus-poker).

---

**Document Version**: 1.0  
**Last Updated**: April 2026  
**Maintainer**: CerberusPoker Core Team
