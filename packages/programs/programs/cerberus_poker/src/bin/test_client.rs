use arcium_client::mxe::MXE;
use std::str::FromStr;
use solana_program::pubkey::Pubkey;

fn main() {
    let program_id = Pubkey::from_str("4yBn3sLRyWK1VuMmkdf7zRB3w9ptM43qaQPicJq3LqbG").unwrap();
    let mxe_pda = arcium_client::pda::derive_mxe_pda(&program_id);
    println!("arcium_client mxe_pda: {:?}", mxe_pda);
}
