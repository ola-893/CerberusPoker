/// CerberusPoker — Confidential Shuffle, Deal, and Reveal Instructions
///
/// These instructions run inside the Arcium MXE under the Cerberus protocol
/// (dishonest majority MPC — secure even if all nodes except one are malicious).

pub mod shuffle;
pub mod deal;
pub mod reveal;

#[cfg(test)]
mod tests;
