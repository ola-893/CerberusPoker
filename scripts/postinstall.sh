#!/bin/bash
# Post-install script to apply patches
# Applies the Anchor instruction buffer size patch to all copies of @coral-xyz/anchor

set -e

echo "Applying patches..."

# Apply patch-package patches (root @coral-xyz/anchor)
npx patch-package 2>/dev/null || true

# Also patch the nested copy inside @arcium-hq/client if it exists
NESTED_ESM="node_modules/@arcium-hq/client/node_modules/@coral-xyz/anchor/dist/esm/coder/borsh/instruction.js"
NESTED_CJS="node_modules/@arcium-hq/client/node_modules/@coral-xyz/anchor/dist/cjs/coder/borsh/instruction.js"

if [ -f "$NESTED_ESM" ]; then
  sed -i.bak 's/alloc(1000)/alloc(4096)/g' "$NESTED_ESM"
  rm -f "${NESTED_ESM}.bak"
  echo "Patched nested ESM instruction coder"
fi

if [ -f "$NESTED_CJS" ]; then
  sed -i.bak 's/alloc(1000)/alloc(4096)/g' "$NESTED_CJS"
  rm -f "${NESTED_CJS}.bak"
  echo "Patched nested CJS instruction coder"
fi

# Also patch the browser builds!
find node_modules/@coral-xyz/anchor node_modules/@arcium-hq -type f -name "index.js" -o -name "instruction.js" | while read -r file; do
  if grep -q "alloc(1000)" "$file"; then
    sed -i.bak 's/alloc(1000)/alloc(4096)/g' "$file"
    rm -f "${file}.bak"
    echo "Patched $file"
  fi
done

echo "Patches applied successfully"
