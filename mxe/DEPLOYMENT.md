# MXE Deployment Information

## Devnet Deployment

**Deployment Date**: April 30, 2026

### Program Details
- **Program ID**: `A6ceZoK8XgD6rBASfe6FvxQ2vSaqWzfSdira8H4wzM5V`
- **IDL Account**: `GS5gvZ8K5WKwa1dyF4vVSF9SUaVNos4NALCD8hsw9DJx`
- **Cluster**: Devnet (https://api.devnet.solana.com)
- **Cluster Offset**: 456
- **Recovery Set Size**: 4

### Deployment Transactions
1. **Program Deployment**: 
   - Signature: `2ufDwE86s9CTxcMnFGaTDFfUQDCqAw54LtsMVJZfwJ5fNHX9ZD1ywktutYfmF2z69PZYLi1jiTJdwWym5Kfr8QG2`
   - Explorer: https://explorer.solana.com/tx/2ufDwE86s9CTxcMnFGaTDFfUQDCqAw54LtsMVJZfwJ5fNHX9ZD1ywktutYfmF2z69PZYLi1jiTJdwWym5Kfr8QG2?cluster=devnet

2. **MXE Initialization**:
   - Signature: `VrN9KSebVcfH17S78zX4R25MtShzLUz2w7ZGcXk41o39pbaK9NeCVYacGBeTagk1nbTBvTNC7zN56JRLfFQ5ULV`
   - Explorer: https://explorer.solana.com/tx/VrN9KSebVcfH17S78zX4R25MtShzLUz2w7ZGcXk41o39pbaK9NeCVYacGBeTagk1nbTBvTNC7zN56JRLfFQ5ULV?cluster=devnet

3. **Rent Claim (Computation 1)**:
   - Signature: `cKt2aps3ijT5aE13rakBUeisboSL2LAkSk42qUGkj2WpTCj6hd9SJMZsKrtB2h5RTipZHqethQVgVjoynZGktNu`
   - Computation ID: `7619821769467878558`
   - Explorer: https://explorer.solana.com/tx/cKt2aps3ijT5aE13rakBUeisboSL2LAkSk42qUGkj2WpTCj6hd9SJMZsKrtB2h5RTipZHqethQVgVjoynZGktNu?cluster=devnet

4. **Key Recovery Material**:
   - Signature: `5MfkAPTdJKvim9QBeuoYTNBi1HcKdxacy2V7J6dpMrWQeZcH6UmkcJKR5zU5fT72CLWb2PD7uWb8x2Jn4g7YEFmU`
   - Explorer: https://explorer.solana.com/tx/5MfkAPTdJKvim9QBeuoYTNBi1HcKdxacy2V7J6dpMrWQeZcH6UmkcJKR5zU5fT72CLWb2PD7uWb8x2Jn4g7YEFmU?cluster=devnet

5. **Rent Claim (Computation 2)**:
   - Signature: `2zzbcFNJnFCjR9dmSxawJtoUCxyo3oyMoPB899V4qAXNAZ3wiHsThPJgo5LvrZWZcbrjByc4XoDMEKKvity7zauN`
   - Computation ID: `9315145322907766806`
   - Explorer: https://explorer.solana.com/tx/2zzbcFNJnFCjR9dmSxawJtoUCxyo3oyMoPB899V4qAXNAZ3wiHsThPJgo5LvrZWZcbrjByc4XoDMEKKvity7zauN?cluster=devnet

### Encrypted Instructions Available
- `shuffle_deck` - Confidential deck shuffling using Cerberus MPC
- `deal_card` - Threshold decryption for card dealing
- `reveal_card` - Community card reveal
- `atomic_showdown` - Atomic reveal of all hole cards
- `verify_deck_integrity` - Deck integrity verification

### Build Notes
- Arcium CLI version: 0.9.7
- Rust toolchain: 1.89.0 (as specified in rust-toolchain.toml)
- Anchor version: 0.32.1
- Fixed indexmap dependency conflict by patching to git source (tag 2.13.0)

### Known Issues
- Stack offset warnings during build (non-critical, program deployed successfully)
- indexmap 2.14.0 requires edition 2024 which is not supported by Rust 1.89.0/Cargo 1.84.0
- Workaround: Patched indexmap to use git source at tag 2.13.0

## Redeployment Instructions

To redeploy or update the MXE:

```bash
cd mxe
arcium build
arcium deploy --cluster-offset 456 --recovery-set-size 4 --keypair-path ~/.config/solana/id.json -u d
```

For mainnet deployment (when ready):
```bash
arcium deploy --cluster-offset 2026 --recovery-set-size 4 --keypair-path ~/.config/solana/id.json -u m
```
