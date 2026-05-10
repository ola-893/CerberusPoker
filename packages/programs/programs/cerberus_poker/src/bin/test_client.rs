use anchor_lang::prelude::Pubkey;
use std::str::FromStr;

fn main() {
    let program_id = Pubkey::from_str("4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG").unwrap();
    let mxe_pda = arcium_client::pda::mxe_acc(&program_id);
    println!("arcium_client mxe_pda: {:?}", mxe_pda);
}
