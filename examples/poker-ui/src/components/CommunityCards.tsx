/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import PlayingCard from './PlayingCard';
import { UNASSIGNED } from '../types';

interface CommunityCardsProps {
  cards: number[];
  pot: number;
}

export default function CommunityCards({ cards, pot }: CommunityCardsProps) {
  // Determine phase based on unrevealed cards
  const revealedCount = cards.filter(c => c !== UNASSIGNED).length;
  const phaseLabel = revealedCount === 0 ? 'PRE-FLOP' : 
                     revealedCount === 3 ? 'FLOP' : 
                     revealedCount === 4 ? 'TURN' : 'RIVER';

  return (
    <div className="flex flex-col items-center gap-6 z-10">
      <div className="px-4 py-1.5 bg-black/40 rounded-full border border-gold-dim/30 shadow-[0_0_15px_rgba(201,168,76,0.1)]">
        <span className="font-mono text-gold text-[10px] font-bold tracking-widest uppercase">{phaseLabel}</span>
      </div>

      <div className="flex gap-2.5">
        {cards.map((card, i) => (
          <PlayingCard 
            key={i} 
            value={card} 
            className="shadow-2xl"
          />
        ))}
      </div>

      <div className="flex flex-col items-center">
        <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-1 opacity-60">Main Pot</div>
        <div className="text-gold font-mono font-bold text-3xl tracking-tighter flex items-center gap-2">
          {pot.toFixed(2)} <span className="text-xl">USDC+</span>
        </div>
      </div>
    </div>
  );
}
