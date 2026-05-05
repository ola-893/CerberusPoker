import os
import glob

def fix_sysvar_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if 'instructions_sysvar:' in content:
        return
        
    lines = content.split('\n')
    new_lines = []
    
    in_struct = False
    for i, line in enumerate(lines):
        new_lines.append(line)
        if '#[derive(Accounts)]' in line or '#[callback_accounts' in line or '#[queue_computation_accounts' in line or '#[init_computation_definition_accounts' in line:
            in_struct = True
        
        if in_struct and 'pub struct ' in line:
            # We found the struct, add instructions_sysvar right after {
            if '{' in line:
                new_lines.append('    /// CHECK: instructions_sysvar, checked by arcium program.')
                new_lines.append('    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]')
                new_lines.append("    pub instructions_sysvar: UncheckedAccount<'info>,")
                in_struct = False
            
    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines))

def main():
    directory = '/Users/ola/Documents/Github/CerberusPoker/packages/programs/programs/cerberus_poker/src/instructions'
    for filename in glob.glob(os.path.join(directory, '*.rs')):
        if filename.endswith('mod.rs'): continue
        fix_sysvar_in_file(filename)

if __name__ == '__main__':
    main()
