#!/bin/bash
# Temporary workaround for MSRV incompatibility between Arcium SDK and Solana platform-tools
# This script strips rust-version requirements from Cargo.toml files before building

set -e

echo "Stripping MSRV requirements from dependencies..."

# Find all Cargo.toml files in the cargo registry and strip rust-version
find ~/.cargo/registry/src -name "Cargo.toml" -type f 2>/dev/null | while read -r file; do
    if grep -q "rust-version" "$file" 2>/dev/null; then
        sed -i.bak '/^rust-version/d' "$file" 2>/dev/null || true
    fi
done

echo "Building with anchor..."
anchor build "$@"

echo "Build complete!"
