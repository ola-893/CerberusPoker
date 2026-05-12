use anchor_lang::prelude::*;
use std::str::FromStr;

fn main() {
    let program_id = Pubkey::from_str("CMtyqKPtwG3Eyfwg36cZXycNsdHBXANW6ZHY5SWVa6ye").unwrap();
    let arcium_id = Pubkey::from_str("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ").unwrap();

    let mxe_pda = Pubkey::find_program_address(&[b"MXEAccount", program_id.as_ref()], &arcium_id);
    println!("MXEAccount: {:?}", mxe_pda);

    let signer_pda = Pubkey::find_program_address(&[b"ArciumSignerAccount"], &program_id);
    println!("ArciumSignerAccount: {:?}", signer_pda);
}
