import os

files = {
    'deal_card_to_recipient_callback.rs': (
        'DealCardOutput', 'DealCardToRecipientOutput', 1
    ),
    'atomic_showdown_callback.rs': (
        'AtomicShowdownOutput', 'AtomicShowdownOutput', 13
    ),
    'reveal_community_card_callback.rs': (
        'RevealCommunityCardOutput', 'RevealCommunityCardOutput', 2
    ),
    'shuffle_deck_callback.rs': (
        'ShuffleDeckOutput', 'ShuffleDeckOutput', 32
    ),
    'reveal_card_callback.rs': (
        'RevealCardOutput', 'RevealCardOutput', 1
    )
}

base_dir = '/Users/ola/Documents/Github/CerberusPoker/packages/programs/programs/cerberus_poker/src/instructions/'

for fname, (old_name, new_name, size) in files.items():
    path = os.path.join(base_dir, fname)
    if not os.path.exists(path): continue
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Replace name
    content = content.replace(old_name, new_name)
    
    # Ensure derives
    if '#[derive(AnchorDeserialize)]' in content:
        content = content.replace(
            '#[derive(AnchorDeserialize)]',
            '#[derive(AnchorSerialize, AnchorDeserialize, Clone)]'
        )
    elif '#[derive(AnchorSerialize, AnchorDeserialize)]' not in content:
        content = content.replace(
            f'pub struct {new_name}',
            f'#[derive(AnchorSerialize, AnchorDeserialize, Clone)]\npub struct {new_name}'
        )
        
    # Add HasSize
    has_size_impl = f'\nimpl arcium_anchor::HasSize for {new_name} {{\n    const SIZE: usize = {size};\n}}\n'
    if 'impl arcium_anchor::HasSize' not in content:
        content += has_size_impl
        
    with open(path, 'w') as f:
        f.write(content)

# Fix lib.rs specifically for DealCardOutput -> DealCardToRecipientOutput
with open('/Users/ola/Documents/Github/CerberusPoker/packages/programs/programs/cerberus_poker/src/lib.rs', 'r') as f:
    lib_content = f.read()

lib_content = lib_content.replace('DealCardOutput', 'DealCardToRecipientOutput')

with open('/Users/ola/Documents/Github/CerberusPoker/packages/programs/programs/cerberus_poker/src/lib.rs', 'w') as f:
    f.write(lib_content)

