.PHONY: build test clean deploy-devnet deploy-mainnet build-programs build-sdk lint fmt

# ─── Build ────────────────────────────────────────────────────────────────────

build: build-programs build-sdk

build-programs:
	@echo "Building Solana programs..."
	cd packages/programs && anchor build

build-sdk:
	@echo "Building TypeScript SDK..."
	npm run build --workspaces --if-present

build-mxe:
	@echo "Building Arcium MXE program..."
	cd mxe && cargo build --release

# ─── Test ─────────────────────────────────────────────────────────────────────

test: test-programs test-sdk

test-programs:
	@echo "Running Solana program tests (bankrun)..."
	cd packages/programs && cargo test

test-sdk:
	@echo "Running TypeScript SDK tests..."
	npm run test --workspaces --if-present

test-e2e:
	@echo "Running end-to-end tests against localnet..."
	cd packages/programs && anchor test

# ─── Lint & Format ────────────────────────────────────────────────────────────

lint:
	@echo "Linting Rust..."
	cd packages/programs && cargo clippy -- -D warnings
	cd mxe && cargo clippy -- -D warnings
	@echo "Linting TypeScript..."
	npm run lint --workspaces --if-present

fmt:
	@echo "Formatting Rust..."
	cd packages/programs && cargo fmt
	cd mxe && cargo fmt
	@echo "Formatting TypeScript..."
	npm run fmt --workspaces --if-present

# ─── Deploy ───────────────────────────────────────────────────────────────────

deploy-devnet:
	@echo "Deploying to Solana devnet..."
	solana config set --url devnet
	cd packages/programs && anchor deploy --provider.cluster devnet
	@echo "Devnet deployment complete."
	@echo "Update Anchor.toml [programs.devnet] with the new program IDs."

deploy-mainnet:
	@echo "⚠️  Deploying to Solana mainnet-beta..."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	solana config set --url mainnet-beta
	cd packages/programs && anchor deploy --provider.cluster mainnet
	@echo "Mainnet deployment complete."

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	@echo "Cleaning build artifacts..."
	cd packages/programs && cargo clean && rm -rf .anchor target
	cd mxe && cargo clean
	npm run clean --workspaces --if-present
	@echo "Clean complete."

# ─── Setup ────────────────────────────────────────────────────────────────────

setup:
	@echo "Installing npm dependencies..."
	npm install
	@echo "Checking Solana CLI..."
	solana --version
	@echo "Checking Anchor CLI..."
	anchor --version
	@echo "Setup complete. Run 'make build' to build all programs."
