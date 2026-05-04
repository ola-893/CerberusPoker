# Architecture — CerberusPoker

## Why MPC Over ZK for Card Games?

Card games require a fundamental primitive that ZK alone cannot provide: **confidential shared state**. In poker:

- No single party should know the full deck order
- Cards must be dealt privately to individual players
- Community cards must be revealed verifiably
- The shuffle must be provably fair without revealing the permutation

### ZK Approach (e.g., zkShuffle)
In ZK-based mental poker, each player encrypts the deck with their key, and reveal requires all players to provide decryption tokens. This creates:
- **O(n²) round complexity** — each player must shuffle and re-encrypt the entire deck
- **Liveness failures** — if any player goes offline, the game stalls permanently
- **Large proof sizes** — ZK proofs for shuffle correctness are computationally expensive

### MPC Approach (Arcium MXE)
CerberusPoker uses Arcium's MPC cluster to perform card operations:
- **O(1) round complexity** — single round-trip to MXE for shuffle/deal/reveal
- **Threshold liveness** — MXE operates with k-of-n recovery sets; individual node failures are tolerated
- **No proofs needed** — the MXE cluster collectively computes and attests results
- **Native Solana integration** — computations are queued and callbacks are received as Solana transactions

The tradeoff: MPC requires trust in the MXE cluster (at least k nodes must be honest). For a poker game, this is acceptable — the cluster has no incentive to collude, and Arcium provides economic security via staking.

## Program Architecture

### `cerberus_poker` — Game-Agnostic Protocol

This program handles all card-related operations and is designed to be used by any card game:

```
cerberus_poker
├── create_game         — Initialize game session PDA
├── join_game           — Add player to session
├── start_shuffle       — Queue shuffle computation on MXE
├── shuffle_deck_callback — MXE callback: store shuffled deck
├── deal_cards          — Queue deal computation for card assignments
├── deal_card_callback  — MXE callback: store dealt card ciphertext
├── reveal_card         — Queue reveal computation for community card
├── reveal_card_callback — MXE callback: store plaintext card value
├── atomic_showdown_callback — MXE callback: reveal all hole cards
├── timeout_shuffle     — Eliminate stalling player during shuffle
└── timeout_reveal      — Eliminate stalling player during reveal
```

**Key Design Decision: Computation Definitions**

Each MXE circuit must be registered on-chain via `init_*_comp_def` instructions. These are called once after deployment and map instruction names to computation definition offsets via `comp_def_offset()`.

### `texas_holdem` — Game-Specific Logic

This program implements Texas Hold'em rules on top of `cerberus_poker`:

```
texas_holdem
├── create_table        — Initialize poker table PDA linked to game session
├── post_blinds         — Deduct small/big blind from players
├── player_action       — Handle Fold/Check/Call/Raise/AllIn
├── advance_phase       — Transition PreFlop→Flop→Turn→River→Showdown
├── place_bet           — Transfer USDC+ to escrow + queue MXE encryption
├── place_bet_callback  — MXE callback: store encrypted bet amount
├── verify_hole_cards   — Set hand_verified_bitmap bit for a player
├── showdown            — Evaluate hands and determine winner
├── settle_showdown     — MXE callback: distribute pot to winner(s)
└── timeout_bet         — Force fold after BETTING_TIMEOUT_SECS
```

**Key Design Decision: Client-Orchestrated Reveals**

The `advance_phase` instruction transitions the poker phase but does NOT directly reveal community cards via CPI. Instead, it logs which card indices need revealing, and the client calls `cerberus_poker::reveal_card` for each. This avoids:
- Complex CPI account management (17+ Arcium accounts)
- Circular dependency issues
- Allows parallel reveal operations

### Hand Evaluator

The on-chain hand evaluator in `hand_eval.rs` supports all 10 hand rankings with kicker tiebreaker logic. Estimated compute usage:
- ~1,500 CU per hand evaluation
- ~9,000 CU for 6-player showdown
- 4.5% of default 200,000 CU limit

## SDK Architecture

```
@cerberus-poker/core     — Wallet adapter, transaction builder, event subscriptions
@cerberus-poker/deck     — Shuffle, deal, decrypt, reveal via MXE
@cerberus-poker/wager    — USDC+ betting, fold, call, settle
```

The SDK is designed for composability:
- `core` provides the foundation (connection, wallet, events)
- `deck` and `wager` are modules that can be used independently
- Frontend imports all three and composes them into a complete game

## State Management

### Bitmaps
Player state is tracked using `u16` bitmaps for O(1) operations:
- `folded_bitmap` — which players have folded
- `all_in_bitmap` — which players are all-in
- `hand_verified_bitmap` — which players' hands are verified for showdown
- `shuffle_bitmap` — which players have contributed to shuffle

### Timeouts
All operations have enforced timeouts:
- `SHUFFLE_TIMEOUT_SECS = 300` (5 minutes per shuffle contribution)
- `REVEAL_TIMEOUT_SECS = 300` (5 minutes per reveal)
- `BETTING_TIMEOUT_SECS = 120` (2 minutes per betting action)

Any user can trigger a timeout after the deadline, eliminating stalling players.

## Wager Strategy

### Phase 1 (Current): USDC+ via Reflect Protocol
- Players deposit USDC+ (yield-bearing stablecoin) into an escrow PDA
- Bet amounts are transferred as standard SPL tokens
- Encrypted bet amounts stored in MXE as `Enc<Mxe, u64>`
- At showdown, escrow releases funds to winner

### Phase 2 (Future): Confidential SPL (C-SPL)
When Arcium's C-SPL standard becomes available:
- Bet transfers will use confidential SPL transfers
- Balance and amounts will be encrypted on-chain
- The SDK interface (`WagerModule`) remains identical
- Only the backend implementation changes

See [C-SPL-UPGRADE-PATH.md](./packages/sdk/wager/C-SPL-UPGRADE-PATH.md) for migration details.

## Building a New Card Game: Blackjack Example

1. **Create program**: `anchor new blackjack`
2. **Define state**: `BlackjackTable` with `dealer_hand`, `player_hands`, `shoe_position`
3. **Use cerberus_poker**: CPI into `deal_cards` and `reveal_card`
4. **Implement rules**: Hit/stand/double/split logic
5. **Settlement**: Transfer from escrow to winner based on hand comparison
6. **Frontend**: Import `@cerberus-poker/core` + `@cerberus-poker/deck`, build Blackjack UI

The key insight: `cerberus_poker` handles ALL privacy concerns. Your game program only needs to implement game rules and call `cerberus_poker` via CPI for card operations.
