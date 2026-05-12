use std::str::FromStr;
fn main() {
    let program_id = solana_program::pubkey::Pubkey::from_str("CMtyqKPtwG3Eyfwg36cZXycNsdHBXANW6ZHY5SWVa6ye").unwrap();
    let arcium_id = solana_program::pubkey::Pubkey::from_str("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ").unwrap();
    let (mxe_pda, _) = solana_program::pubkey::Pubkey::find_program_address(&[b"mxe_account", program_id.as_ref()], &arcium_id);
    println!("mxe_account: {}", mxe_pda);
}
