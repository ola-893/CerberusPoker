/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import PlayingCard from './PlayingCard';
import { motion } from 'framer-motion';

interface HoleCardsProps {
  cards: [number, number] | null;
}

export default function HoleCards({ cards }: HoleCardsProps) {
  if (!cards) return null;
  
  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none z-20">
      {cards.map((card, i) => (
        <motion.div
          key={i}
          initial={{ y: 50, opacity: 0, rotate: i === 0 ? -10 : 10 }}
          animate={{ y: 0, opacity: 1, rotate: i === 0 ? -5 : 5 }}
          className="shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
          <PlayingCard value={card} isLarge />
        </motion.div>
      ))}
      
      {/* Hand Label */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-fit">
        <div className="px-4 py-1 bg-gold/10 border border-gold/20 rounded-full backdrop-blur-md">
          <span className="font-mono text-gold text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Your Hand</span>
        </div>
      </div>
    </div>
  );
}
