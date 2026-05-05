import os

base_dir = '/Users/ola/Documents/Github/CerberusPoker/packages/programs'
mock_dir = os.path.join(base_dir, 'arcium-client-mock')
src_dir = os.path.join(mock_dir, 'src')

os.makedirs(src_dir, exist_ok=True)

with open(os.path.join(mock_dir, 'Cargo.toml'), 'w') as f:
    f.write('''[package]
name = "arcium-client"
version = "0.9.7"
edition = "2021"

[dependencies]
anchor-lang = "0.32.1"
''')

with open(os.path.join(src_dir, 'lib.rs'), 'w') as f:
    f.write('''pub mod idl {
    pub mod arcium {
        pub mod types {
            use anchor_lang::prelude::*;

            #[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
            pub enum Parameter {
                PlaintextBool, PlaintextU8, PlaintextU16, PlaintextU32, PlaintextU64, PlaintextU128,
                PlaintextI8, PlaintextI16, PlaintextI32, PlaintextI64, PlaintextI128,
                Ciphertext, ArcisX25519Pubkey, PlaintextPoint, PlaintextFloat
            }

            #[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
            pub enum Output {
                PlaintextBool, PlaintextU8, PlaintextU16, PlaintextU32, PlaintextU64, PlaintextU128,
                PlaintextI8, PlaintextI16, PlaintextI32, PlaintextI64, PlaintextI128,
                Ciphertext, ArcisX25519Pubkey, PlaintextPoint, PlaintextFloat
            }

            #[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
            pub struct CallbackInstruction {
                pub program_id: Pubkey,
                pub accounts: Vec<CallbackAccount>,
                pub data: Vec<u8>,
            }

            #[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
            pub struct CallbackAccount {
                pub pubkey: Pubkey,
                pub is_signer: bool,
                pub is_writable: bool,
            }
        }
    }
}

pub const ARCIUM_PROGRAM_ID: anchor_lang::prelude::Pubkey = anchor_lang::prelude::Pubkey::new_from_array([0; 32]);
''')

# Now add it to the workspace in packages/programs/Cargo.toml
with open(os.path.join(base_dir, 'Cargo.toml'), 'r') as f:
    cargo_toml = f.read()

if '"arcium-client-mock"' not in cargo_toml:
    cargo_toml = cargo_toml.replace('members = [', 'members = [\n    "arcium-client-mock",')
    with open(os.path.join(base_dir, 'Cargo.toml'), 'w') as f:
        f.write(cargo_toml)

