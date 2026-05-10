import os
import re

files_to_clean = [
    'deal_card_to_recipient_callback.rs',
    'atomic_showdown_callback.rs',
    'reveal_community_card_callback.rs',
    'shuffle_deck_callback.rs',
    'reveal_card_callback.rs'
]

base_dir = '/Users/ola/Documents/Github/CerberusPoker/packages/programs/programs/cerberus_poker/src/instructions/'

for fname in files_to_clean:
    path = os.path.join(base_dir, fname)
    if not os.path.exists(path): continue
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Remove the struct definition
    content = re.sub(r'#\[derive\(AnchorSerialize, AnchorDeserialize, Clone\)\]\npub struct \w+Output \{[\s\S]*?\}\n', '', content)
    content = re.sub(r'#\[derive\(AnchorDeserialize\)\]\npub struct \w+Output \{[\s\S]*?\}\n', '', content)
    content = re.sub(r'pub struct \w+Output \{[\s\S]*?\}\n', '', content)
    
    # Remove the HasSize impl
    content = re.sub(r'impl arcium_anchor::HasSize for \w+Output \{[\s\S]*?\}\n', '', content)
    
    with open(path, 'w') as f:
        f.write(content)

