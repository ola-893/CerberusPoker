# CerberusPoker Development Guide

Complete guide for developing, testing, and contributing to CerberusPoker.

## Table of Contents

1. [Development Workflow](#development-workflow)
2. [Testing](#testing)
3. [Building](#building)
4. [Deployment](#deployment)
5. [SDK Development](#sdk-development)
6. [Program Development](#program-development)
7. [MXE Development](#mxe-development)
8. [Frontend Development](#frontend-development)
9. [Contributing](#contributing)

---

## Development Workflow

### Daily Development Loop

```bash
# 1. Start local validator (Terminal 1)
solana-test-validator

# 2. Watch and rebuild programs (Terminal 2)
cd packages/programs
anchor build --watch

# 3. Start frontend dev server (Terminal 3)
cd examples/poker-ui
npm run dev

# 4. Run tests as you develop (Terminal 4)
cd packages/programs
anchor test --skip-build
```

### Making Changes

1. **Edit code** in your preferred editor
2. **Build** to check for compilation errors
3. **Test** to verify functionality
4. **Deploy** to localnet to test integration
5. **Commit** with descriptive messages

---

## Testing

### Solana Program Tests

```bash
cd packages/programs

# Run all tests
anchor test

# Run specific test file
anchor test --skip-build -- --grep "betting round"

# Run with detailed logs
anchor test -- --nocapture

# Test on devnet
anchor test --provider.cluster devnet --skip-build
```

### SDK Tests

```bash
# Test all SDK packages
npm test

# Test specific package
cd packages/sdk/core && npm test
cd packages/sdk/deck && npm test
cd packages/sdk/wager && npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### MXE Tests

```bash
cd mxe

# Run unit tests (requires Docker)
arcium test

# Run on devnet
arcium test --cluster devnet

# Run specific test
cargo test --package encrypted-ixs test_shuffle_produces_52_unique_values
```

### Frontend Tests

```bash
cd examples/poker-ui

# Run component tests
npm test

# Run E2E tests
npm run test:e2e

# Watch mode
npm test -- --watch
```

### Integration Tests

```bash
# Full E2E test suite
npm run test:integration

# This tests:
# - 2-player full game
# - 6-player game with folds
# - Shuffle timeout
# - Reveal timeout
# - Split pot
```

---

## Building

### Build All

```bash
# From project root
make build

# Or manually:
cd packages/programs && anchor build
cd ../../mxe && arcium build
cd ../packages/sdk && npm run build
cd ../examples/poker-ui && npm run build
```

### Build Solana Programs

```bash
cd packages/programs

# Build all programs
anchor build

# Build specific program
anchor build --program cerberus_poker
anchor build --program texas_holdem

# Check program size
ls -lh target/deploy/*.so
```

### Build MXE

```bash
cd mxe

# Build MXE circuits
arcium build

# Output: target/deploy/mxe.so
```

### Build SDK

```bash
cd packages/sdk

# Build all SDK packages
npm run build

# Build specific package
cd core && npm run build
cd deck && npm run build
cd wager && npm run build
```

### Build Frontend

```bash
cd examples/poker-ui

# Development build
npm run build

# Production build with optimizations
npm run build -- --mode production
```

---

## Deployment

### Deploy to Localnet

```bash
# 1. Start validator
solana-test-validator

# 2. Deploy programs
cd packages/programs
anchor deploy

# 3. Update program IDs in code
# Edit Anchor.toml and examples/poker-ui/src/lib/anchor.ts
```

### Deploy to Devnet

```bash
# 1. Configure Solana
solana config set --url devnet

# 2. Fund wallet
solana airdrop 2

# 3. Deploy MXE
cd mxe
arcium deploy --cluster-offset 456 --recovery-set-size 4 -k ~/.config/solana/id.json -u d

# 4. Deploy programs
cd ../packages/programs
anchor deploy --provider.cluster devnet

# 5. Initialize computation definitions
cd ../..
npx tsx scripts/init-comp-defs.ts --cluster devnet

# 6. Update configuration
# Edit Anchor.toml, anchor.ts, and .env files

# 7. Deploy frontend
cd examples/poker-ui
npm run build
vercel --prod
```

### Deploy to Mainnet

See [SETUP.md](./SETUP.md#mainnet-deployment) for detailed mainnet deployment instructions.

---

## SDK Development

### Adding a New SDK Method

1. **Define the method** in the appropriate module:

```typescript
// packages/sdk/deck/src/index.ts
export class DeckModule {
  async myNewMethod(gameId: bigint, param: string): Promise<string> {
    // Implementation
  }
}
```

2. **Add JSDoc comments**:

```typescript
/**
 * My new method description
 * 
 * @param gameId - Unique identifier for the game
 * @param param - Description of parameter
 * @returns Description of return value
 * @throws Error if something goes wrong
 * 
 * @example
 * ```typescript
 * const result = await sdk.deck.myNewMethod(gameId, "value");
 * ```
 */
async myNewMethod(gameId: bigint, param: string): Promise<string> {
  // Implementation
}
```

3. **Write tests**:

```typescript
// packages/sdk/deck/tests/myNewMethod.test.ts
import { DeckModule } from '../src';

describe('DeckModule.myNewMethod', () => {
  it('should do something', async () => {
    const deck = new DeckModule(/* config */);
    const result = await deck.myNewMethod(123n, "test");
    expect(result).toBe("expected");
  });
});
```

4. **Build and test**:

```bash
cd packages/sdk/deck
npm run build
npm test
```

### SDK Package Structure

```
packages/sdk/
├── core/           # Core SDK functionality
│   ├── src/
│   │   ├── index.ts          # Main entry point
│   │   ├── types.ts          # Shared types
│   │   ├── wallet.ts         # Wallet adapter
│   │   ├── transaction.ts    # Transaction builder
│   │   └── events.ts         # Event subscriptions
│   ├── tests/
│   └── package.json
├── deck/           # Deck module
│   ├── src/
│   │   ├── index.ts          # DeckModule class
│   │   └── arcium-client.ts  # Arcium integration
│   ├── tests/
│   └── package.json
└── wager/          # Wager module
    ├── src/
    │   ├── index.ts          # WagerModule class
    │   └── cspl.ts           # C-SPL helpers
    ├── tests/
    └── package.json
```

---

## Program Development

### Adding a New Instruction

1. **Define the instruction** in `lib.rs`:

```rust
// packages/programs/programs/texas_holdem/src/lib.rs
#[program]
pub mod texas_holdem {
    pub fn my_new_instruction(
        ctx: Context<MyNewInstruction>,
        param: u64,
    ) -> Result<()> {
        instructions::my_new_instruction::handler(ctx, param)
    }
}
```

2. **Create the instruction file**:

```rust
// packages/programs/programs/texas_holdem/src/instructions/my_new_instruction.rs
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

pub fn handler(ctx: Context<MyNewInstruction>, param: u64) -> Result<()> {
    let poker_table = &mut ctx.accounts.poker_table;
    
    // Validation
    require!(param > 0, ErrorCode::InvalidParameter);
    
    // Logic
    poker_table.some_field = param;
    
    Ok(())
}

#[derive(Accounts)]
pub struct MyNewInstruction<'info> {
    #[account(mut)]
    pub poker_table: Account<'info, PokerTable>,
    
    pub authority: Signer<'info>,
}
```

3. **Add to mod.rs**:

```rust
// packages/programs/programs/texas_holdem/src/instructions/mod.rs
pub mod my_new_instruction;
pub use my_new_instruction::*;
```

4. **Write tests**:

```typescript
// packages/programs/tests/my_new_instruction.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TexasHoldem } from "../target/types/texas_holdem";

describe("my_new_instruction", () => {
  it("should work correctly", async () => {
    const program = anchor.workspace.TexasHoldem as Program<TexasHoldem>;
    
    await program.methods
      .myNewInstruction(new anchor.BN(100))
      .accounts({ /* accounts */ })
      .rpc();
    
    // Assertions
  });
});
```

5. **Build and test**:

```bash
cd packages/programs
anchor build
anchor test
```

### Program Structure

```
packages/programs/programs/texas_holdem/
├── src/
│   ├── lib.rs                # Program entry point
│   ├── state.rs              # Account structs
│   ├── errors.rs             # Custom errors
│   ├── instructions/         # Instruction handlers
│   │   ├── mod.rs
│   │   ├── create_table.rs
│   │   ├── player_action.rs
│   │   └── ...
│   └── hand_eval.rs          # Hand evaluator
└── Cargo.toml
```

---

## MXE Development

### Adding a New Encrypted Instruction

1. **Create the circuit file**:

```rust
// mxe/encrypted-ixs/my_circuit.rs
use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// My new encrypted instruction
    #[instruction]
    pub fn my_encrypted_operation(
        input: Enc<Mxe, u64>,
    ) -> Enc<Mxe, u64> {
        let value = input.to_arcis();
        let result = value * 2;  // Example operation
        input.owner.from_arcis(result)
    }
}
```

2. **Add to lib.rs**:

```rust
// mxe/src/lib.rs
pub mod my_circuit;
```

3. **Write tests**:

```rust
// mxe/encrypted-ixs/tests/my_circuit_test.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_encrypted_operation() {
        // Test implementation
    }
}
```

4. **Build and test**:

```bash
cd mxe
arcium build
arcium test
```

### MXE Constraints

- **No Vec, HashMap, or String** - Use fixed-size arrays only
- **Output limit**: ~1232 bytes per callback transaction
- **Enc<Mxe, T>**: Only MXE can decrypt (deck state)
- **Enc<Shared, T>**: Client + MXE share secret (dealt cards)

---

## Frontend Development

### Adding a New Component

1. **Create the component**:

```typescript
// examples/poker-ui/src/components/MyComponent.tsx
import React from 'react';

interface MyComponentProps {
  gameId: bigint;
  onAction: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ gameId, onAction }) => {
  return (
    <div className="my-component">
      <h2>Game {gameId.toString()}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  );
};
```

2. **Add styles** (if using CSS modules):

```css
/* examples/poker-ui/src/components/MyComponent.module.css */
.my-component {
  padding: 1rem;
  background: var(--bg-secondary);
}
```

3. **Use in a page**:

```typescript
// examples/poker-ui/src/pages/GameTable.tsx
import { MyComponent } from '../components/MyComponent';

export const GameTable = () => {
  return (
    <div>
      <MyComponent gameId={123n} onAction={() => console.log('Action!')} />
    </div>
  );
};
```

### Frontend Structure

```
examples/poker-ui/
├── src/
│   ├── components/       # Reusable components
│   ├── pages/            # Page components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities and SDK setup
│   ├── store/            # State management
│   ├── types.ts          # TypeScript types
│   └── main.tsx          # Entry point
├── public/               # Static assets
└── package.json
```

---

## Contributing

### Code Style

- **TypeScript**: Use ESLint + Prettier
- **Rust**: Use `rustfmt`
- **Commit messages**: Follow conventional commits

```bash
# Format TypeScript
npm run lint:fix

# Format Rust
cargo fmt

# Check formatting
cargo fmt -- --check
```

### Pull Request Process

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes**
4. **Write tests**
5. **Run all tests**: `npm test && anchor test`
6. **Commit**: `git commit -m "feat: add my feature"`
7. **Push**: `git push origin feature/my-feature`
8. **Open a Pull Request**

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(sdk): add new deck shuffle method
fix(program): correct hand evaluation tiebreaker
docs(readme): update installation instructions
test(mxe): add shuffle privacy property test
```

### Testing Requirements

All PRs must include:
- ✅ Unit tests for new functionality
- ✅ Integration tests if adding new features
- ✅ All existing tests passing
- ✅ No TypeScript errors
- ✅ No Rust warnings

### Documentation Requirements

All PRs must include:
- ✅ JSDoc comments for new SDK methods
- ✅ Inline comments for complex logic
- ✅ Updated README if adding features
- ✅ Updated ARCHITECTURE.md if changing design

---

## Useful Commands

### Development

```bash
# Watch and rebuild
anchor build --watch

# Hot reload frontend
npm run dev

# Run tests in watch mode
npm test -- --watch
```

### Debugging

```bash
# View Solana logs
solana logs

# View program logs with filter
solana logs | grep "Program log"

# Check account data
solana account <ACCOUNT_ADDRESS>

# Decode transaction
solana confirm -v <SIGNATURE>
```

### Performance

```bash
# Measure compute units
sol_log_compute_units();

# Check program size
ls -lh target/deploy/*.so

# Analyze bundle size
npm run build -- --analyze
```

---

## Resources

- **Anchor Documentation**: https://www.anchor-lang.com/docs
- **Arcium Documentation**: https://docs.arcium.com
- **Solana Cookbook**: https://solanacookbook.com
- **Solana Program Library**: https://spl.solana.com

---

**Questions?**

- Open an issue on GitHub
- Check [SETUP.md](./SETUP.md) for setup issues
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for design questions
