/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { PublicKey } from '@solana/web3.js';
import { cn } from '../lib/utils';

interface PlayerSeatProps {
  playerAddress: PublicKey;
  playerIndex: number;
  stack: number;
  currentBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  hasShuffled?: boolean | undefined;
  positionClass: string;
}

export default function PlayerSeat({ 
  playerAddress,
  playerIndex,
  stack,
  currentBet,
  isFolded,
  isAllIn,
  isCurrentTurn,
  isDealer,
  isSmallBlind,
  isBigBlind,
  hasShuffled,
  positionClass 
}: PlayerSeatProps) {
  const formatAddress = (addr: PublicKey) => {
    const str = addr.toBase58();
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  const getStatusColor = () => {
    if (isFolded) return 'bg-folded';
    if (isAllIn) return 'bg-allInStatus';
    if (isCurrentTurn) return 'bg-active animate-pulse';
    return 'bg-waiting';
  };

  const getPositionBadge = () => {
    if (isDealer) return 'D';
    if (isSmallBlind) return 'SB';
    if (isBigBlind) return 'BB';
    return null;
  };

  const position = getPositionBadge();
  
  return (
    <div className={cn("absolute flex flex-col items-center gap-2", positionClass)}>
      {/* Cards Visualization (Backs for opponents) */}
      {!isFolded && (
        <div className="flex -space-x-4 mb-1">
          <motion.div 
            className="w-10 h-14 bg-card-back rounded border border-white/10 shadow-lg -rotate-6"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          />
          <motion.div 
            className="w-10 h-14 bg-card-back rounded border border-white/10 shadow-lg rotate-6"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          />
        </div>
      )}

      {/* Avatar & Status */}
      <div className="relative group">
        <motion.div
          className={cn(
            "w-16 h-16 rounded-full border-2 p-0.5",
            isCurrentTurn ? "border-gold animate-pulse shadow-[0_0_20px_rgba(201,168,76,0.5)]" : "border-zinc-700",
            isFolded && "opacity-50 grayscale"
          )}
        >
          <img 
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${playerAddress.toBase58()}`} 
            alt="Avatar" 
            className="w-full h-full rounded-full bg-zinc-800" 
          />
        </motion.div>
        
        {/* Status Dot */}
        <div className={cn(
          "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-background",
          getStatusColor()
        )} />
        
        {/* Dealer/Blind Badges */}
        {position && (
          <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-gold-dim text-white text-[10px] font-bold flex items-center justify-center border border-white/10 shadow-lg">
            {position}
          </div>
        )}

        {/* Shuffle Progress Badge */}
        {hasShuffled !== undefined && (
          <div className={cn(
            "absolute -top-2 -left-2 w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-[10px]",
            hasShuffled ? "bg-active text-white" : "bg-zinc-800 text-zinc-600"
          )}>
            {hasShuffled ? '✓' : '○'}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className={cn(
        "bg-surface-raised/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-zinc-800 text-center min-w-[100px] shadow-xl",
        isFolded && "opacity-60"
      )}>
        <div className="font-mono text-[10px] text-zinc-400 leading-none mb-1">
          {formatAddress(playerAddress)}
        </div>
        <div className="font-mono text-gold font-bold text-sm leading-none">
          {(stack / 100).toFixed(2)} USDC+
        </div>
      </div>

      {/* Current Bet Chips */}
      {currentBet > 0 && !isFolded && (
        <div className="absolute top-full mt-2 flex flex-col items-center">
          <div className="w-8 h-8 bg-raise rounded-full border-2 border-white/20 shadow-lg flex items-center justify-center">
            <div className="w-6 h-6 bg-raise-dim rounded-full" />
          </div>
          <div className="font-mono text-[10px] text-gold font-bold mt-1">
            {(currentBet / 100).toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
