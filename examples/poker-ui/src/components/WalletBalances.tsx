/**
 * WalletBalances — displays SOL and devnet USDC balances in the header
 */

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletBalances } from '../hooks/useWalletBalances';
import { Loader2 } from 'lucide-react';

export default function WalletBalances() {
  const { connected } = useWallet();
  const { data, isLoading } = useWalletBalances();

  if (!connected) return null;

  return (
    <div className="flex items-center gap-2">
      {/* SOL Balance */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-raised border border-zinc-800 rounded-lg">
        {/* SOL logo */}
        <svg width="16" height="16" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21.4 93.4a3.6 3.6 0 0 1 2.5-1h98.5a1.8 1.8 0 0 1 1.3 3.1L100 119.2a3.6 3.6 0 0 1-2.5 1H-1a1.8 1.8 0 0 1-1.3-3.1l22.7-23.7z" fill="url(#sol-a)"/>
          <path d="M21.4 9.8a3.7 3.7 0 0 1 2.5-1h98.5a1.8 1.8 0 0 1 1.3 3.1L100 35.6a3.6 3.6 0 0 1-2.5 1H-1a1.8 1.8 0 0 1-1.3-3.1L21.4 9.8z" fill="url(#sol-b)"/>
          <path d="M100 51.4a3.6 3.6 0 0 0-2.5-1H-1a1.8 1.8 0 0 0-1.3 3.1l23.7 23.7a3.6 3.6 0 0 0 2.5 1h98.5a1.8 1.8 0 0 0 1.3-3.1L100 51.4z" fill="url(#sol-c)"/>
          <defs>
            <linearGradient id="sol-a" x1="0" y1="64" x2="128" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9945FF"/><stop offset="1" stopColor="#14F195"/>
            </linearGradient>
            <linearGradient id="sol-b" x1="0" y1="64" x2="128" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9945FF"/><stop offset="1" stopColor="#14F195"/>
            </linearGradient>
            <linearGradient id="sol-c" x1="0" y1="64" x2="128" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9945FF"/><stop offset="1" stopColor="#14F195"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="flex flex-col leading-none">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">SOL</span>
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin text-zinc-400 mt-0.5" />
          ) : (
            <span className="text-xs font-mono font-bold text-zinc-100">
              {data?.sol.toFixed(4) ?? '0.0000'}
            </span>
          )}
        </div>
      </div>

      {/* USDC Balance */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-raised border border-zinc-800 rounded-lg">
        {/* USDC logo */}
        <div className="w-4 h-4 rounded-full bg-[#2775CA] flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold" style={{ fontSize: '9px' }}>$</span>
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">USDC</span>
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin text-zinc-400 mt-0.5" />
          ) : (
            <span className="text-xs font-mono font-bold text-zinc-100">
              {data?.usdc.toFixed(2) ?? '0.00'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
