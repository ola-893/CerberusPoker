pub mod idl {
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
