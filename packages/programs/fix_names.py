import os
import glob

def fix_names_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    content = content.replace('deal_card_callback', 'deal_card_to_recipient_callback')
    content = content.replace('DealCardCallback', 'DealCardToRecipientCallback')
    
    with open(filepath, 'w') as f:
        f.write(content)

def main():
    directory = '/Users/ola/Documents/Github/CerberusPoker/packages/programs/programs/cerberus_poker/src'
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.rs'):
                fix_names_in_file(os.path.join(root, file))
    
    # rename the file itself
    os.rename(
        os.path.join(directory, 'instructions/deal_card_callback.rs'),
        os.path.join(directory, 'instructions/deal_card_to_recipient_callback.rs')
    )

if __name__ == '__main__':
    main()
