use anchor_lang::prelude::*;
use std::str::FromStr;

fn main() {
    let program_id = Pubkey::from_str("4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG").unwrap();
    let arcium_id = Pubkey::from_str("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ").unwrap();
    
    let mxe_pda = Pubkey::find_program_address(&[b"mxe_account", program_id.as_ref()], &arcium_id);
    println!("mxe_account: {:?}", mxe_pda);

    let mxe_pda2 = Pubkey::find_program_address(&[b"mxe", program_id.as_ref()], &arcium_id);
    println!("mxe: {:?}", mxe_pda2);
}
