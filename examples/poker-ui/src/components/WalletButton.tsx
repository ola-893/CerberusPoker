/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export default function WalletButton({ className }: { className?: string }) {
  const connected = false; // Mock state

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "bg-gold text-background px-6 py-2 rounded-full font-bold uppercase tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(201,168,76,0.2)]",
        className
      )}
    >
      {connected ? "0x7...4e2" : "Connect Wallet"}
    </motion.button>
  );
}
