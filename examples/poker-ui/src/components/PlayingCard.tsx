/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cardToDisplay } from '../lib/cardUtils';
import { cn } from '../lib/utils';
import { UNREVEALED, UNASSIGNED } from '../types';

interface PlayingCardProps {
  value: number;
  className?: string;
  isLarge?: boolean;
  key?: React.Key;
}

export default function PlayingCard({ value, className, isLarge = false }: PlayingCardProps) {
  const display = cardToDisplay(value);
  const isBack = value === UNREVEALED;
  const isEmpty = value === UNASSIGNED;

  if (isEmpty) {
    return (
      <div 
        className={cn(
          "rounded-lg border-2 border-dashed border-zinc-800 bg-zinc-900/20",
          isLarge ? "w-24 h-36" : "w-16 h-24",
          className
        )}
      />
    );
  }

  return (
    <motion.div
      className={cn("card-flip relative", isLarge ? "w-24 h-36" : "w-16 h-24", className)}
      initial={false}
      aria-label={'back' in display ? 'Card face down' : display.label}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={isBack ? 'back' : 'front'}
          className={cn(
            "absolute inset-0 rounded-lg shadow-xl preserve-3d backface-hidden",
            isBack ? "bg-card-back border border-white/10" : "bg-card-face border border-zinc-300"
          )}
          initial={{ rotateY: -90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: 90, opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {isBack ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-4/5 h-4/5 border border-white/5 rounded-md flex items-center justify-center">
                <div className="w-2 h-2 bg-gold/20 rounded-full" />
              </div>
            </div>
          ) : 'rank' in display ? (
            <div className="w-full h-full p-2 flex flex-col justify-between">
              <div className={cn("text-left font-bold", display.isRed ? "text-suit-red" : "text-suit-black", isLarge ? "text-2xl" : "text-lg")}>
                {display.rank}
                <div className={isLarge ? "text-xl" : "text-sm"}>{display.symbol}</div>
              </div>
              <div className={cn("text-center", display.isRed ? "text-suit-red" : "text-suit-black", isLarge ? "text-5xl" : "text-3xl")}>
                {display.symbol}
              </div>
              <div className={cn("text-left font-bold rotate-180", display.isRed ? "text-suit-red" : "text-suit-black", isLarge ? "text-2xl" : "text-lg")}>
                {display.rank}
                <div className={isLarge ? "text-xl" : "text-sm"}>{display.symbol}</div>
              </div>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
