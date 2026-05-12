/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Action } from '../types';

interface ActionBarProps {
  isMyTurn: boolean;
  currentBet: bigint;
  myCurrentBet: bigint;
  myStack: number;
  bigBlind: bigint;
  canCheck: boolean;
  onAction: (action: Action, amount?: bigint) => void;
}

export default function ActionBar({ 
  isMyTurn, 
  currentBet, 
  myCurrentBet,
  myStack, 
  bigBlind,
  canCheck,
  onAction 
}: ActionBarProps) {
  const currentBetNumber = Number(currentBet);
  const myCurrentBetNumber = Number(myCurrentBet);
  const bigBlindNumber = Number(bigBlind);
  const minRaise = currentBetNumber + bigBlindNumber;
  const maxRaise = myStack;
  const canRaise = maxRaise >= minRaise;
  const callAmount = Math.max(0, currentBetNumber - myCurrentBetNumber);

  const initialRaise = useMemo(() => {
    if (!canRaise) return maxRaise;
    return Math.min(Math.max(minRaise, currentBetNumber), maxRaise);
  }, [canRaise, currentBetNumber, maxRaise, minRaise]);

  const [raiseAmount, setRaiseAmount] = useState(initialRaise);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);

  useEffect(() => {
    setRaiseAmount(initialRaise);
  }, [initialRaise]);
  
  if (!isMyTurn) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-surface-raised/80 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-center z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="text-zinc-500 font-mono text-sm uppercase tracking-widest">
          Waiting for other players...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-surface-raised/80 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-center gap-4 px-6 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      {/* Raise Slider */}
      {showRaiseSlider && canRaise && (
        <div className="flex flex-col gap-2 mr-8 w-64">
          <div className="flex justify-between font-mono text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            <span>Min: {(minRaise / 1_000_000).toFixed(2)}</span>
            <span>{(raiseAmount / 1_000_000).toFixed(2)} USDC+</span>
            <span>Max: {(maxRaise / 1_000_000).toFixed(2)}</span>
          </div>
          <input 
            type="range"
            min={minRaise}
            max={maxRaise}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            className="w-full accent-gold h-1 appearance-none bg-zinc-800 rounded-full" 
          />
          <div className="flex gap-2">
            <button 
              onClick={() => setRaiseAmount(minRaise)}
              className="text-[10px] px-2 py-1 bg-zinc-800 rounded text-zinc-400 hover:text-gold"
            >
              Min
            </button>
            <button 
              onClick={() => setRaiseAmount(Math.floor(minRaise + (maxRaise - minRaise) * 0.5))}
              className="text-[10px] px-2 py-1 bg-zinc-800 rounded text-zinc-400 hover:text-gold"
            >
              0.5× Pot
            </button>
            <button 
              onClick={() => setRaiseAmount(Math.floor(minRaise + (maxRaise - minRaise) * 0.75))}
              className="text-[10px] px-2 py-1 bg-zinc-800 rounded text-zinc-400 hover:text-gold"
            >
              1× Pot
            </button>
            <button 
              onClick={() => setRaiseAmount(maxRaise)}
              className="text-[10px] px-2 py-1 bg-zinc-800 rounded text-zinc-400 hover:text-gold"
            >
              Max
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onAction(Action.Fold)}
        className="h-12 flex-1 max-w-[120px] bg-fold border border-zinc-700 rounded-xl text-white font-bold uppercase tracking-widest text-xs hover:bg-fold/80 transition-colors"
      >
        Fold
      </motion.button>
      
      {canCheck ? (
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction(Action.Check)}
          className="h-12 flex-1 max-w-[120px] bg-check border border-zinc-600 rounded-xl text-zinc-300 font-bold uppercase tracking-widest text-xs hover:bg-zinc-700 transition-colors"
        >
          Check
        </motion.button>
      ) : (
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction(Action.Call, currentBet)}
          className="h-12 flex-1 max-w-[140px] bg-call border border-blue-700 rounded-xl text-white font-bold uppercase tracking-widest text-xs hover:bg-call/80 transition-colors"
        >
          Call {(callAmount / 1_000_000).toFixed(2)}
        </motion.button>
      )}
      
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          if (!canRaise) return;
          if (showRaiseSlider) {
            onAction(Action.Raise, BigInt(raiseAmount));
            setShowRaiseSlider(false);
          } else {
            setShowRaiseSlider(true);
          }
        }}
        disabled={!canRaise}
        className="h-12 flex-1 max-w-[140px] bg-gold text-background rounded-xl font-bold uppercase tracking-widest text-xs shadow-gold-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {showRaiseSlider ? `Raise to ${(raiseAmount / 1_000_000).toFixed(2)}` : 'Raise'}
      </motion.button>

      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onAction(Action.AllIn, BigInt(maxRaise))}
        disabled={maxRaise <= myCurrentBetNumber}
        className="h-12 flex-1 max-w-[120px] bg-allIn border border-purple-700 rounded-xl text-white font-bold uppercase tracking-widest text-xs hover:bg-allIn/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        All-In
      </motion.button>
    </div>
  );
}
