/// CerberusPoker MXE — Arcium encrypted instructions entry point.
///
/// This file re-exports the encrypted instruction modules.
/// The actual MPC logic lives in encrypted-ixs/ and is compiled
/// by the Arcium toolchain (arcium build) into MPC circuits.
///
/// Project structure (Arcium convention):
///   encrypted-ixs/   — Arcis MPC circuit code (#[encrypted] modules)
///   src/             — Solana program code (arcium-anchor)
///   programs/        — Anchor programs that invoke the MXE via CPI
///
/// To build: arcium build
/// To test:  arcium test
/// To deploy: arcium deploy --cluster devnet

pub mod types;

// Re-export encrypted instruction modules
// These are compiled separately by the Arcium toolchain
pub use types::*;
