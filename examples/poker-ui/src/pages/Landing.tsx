import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Shield, Zap, Eye } from 'lucide-react';
import { useEffect } from 'react';

export default function Landing() {
  const navigate = useNavigate();
  const { connected } = useWallet();

  // Redirect to lobby if wallet is already connected
  useEffect(() => {
    if (connected) {
      navigate('/lobby');
    }
  }, [connected, navigate]);

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Floating accent blobs */}
      <div className="absolute top-20 right-20 w-32 h-32 bg-gold/10 rounded-full blur-3xl" />
      <div className="absolute bottom-40 left-20 w-40 h-40 bg-active/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-gold/5 rounded-full blur-2xl" />

      {/* Header */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 bg-surface-raised rounded-2xl flex items-center justify-center border border-zinc-800">
            <div className="w-5 h-5 border-2 border-gold rounded-sm rotate-45" />
          </div>
          <span className="font-semibold text-lg text-zinc-100">
            CerberusPoker
          </span>
        </div>

       
        <div className="flex items-center gap-3">
          <WalletMultiButton className="!bg-gold !text-background hover:!bg-gold/90 !rounded-xl !h-10 !px-5 !text-sm !font-medium" />
        </div>
      </header>

      {/* Hero Section - Bento Grid Layout */}
      <main className="relative z-10 px-8 py-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-12 gap-6">
          
          {/* Main Hero Card - Large */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="col-span-12 lg:col-span-8 bg-surface rounded-3xl p-12 border border-zinc-900 relative overflow-hidden"
          >
            {/* Poker chip stacks as decorative elements */}
            <motion.div 
              className="absolute top-8 right-8 w-20 h-20 flex items-center justify-center"
              animate={{ 
                y: [0, -8, 0],
                rotate: [0, 5, 0]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <div className="relative">
                {/* Gold chips with details */}
                {[0, 3, 6, 9].map((offset, i) => (
                  <motion.div 
                    key={i}
                    className="absolute w-16 h-4 rounded-full border-2 border-gold-dim overflow-hidden" 
                    style={{ top: `${offset}px` }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
                  >
                    {/* Chip face */}
                    <div className="absolute inset-0 bg-gold" />
                    {/* Edge spots pattern */}
                    <div className="absolute inset-0 flex items-center justify-around px-1">
                      <div className="w-1 h-1 bg-gold-dim rounded-full" />
                      <div className="w-1 h-1 bg-gold-dim rounded-full" />
                      <div className="w-1 h-1 bg-gold-dim rounded-full" />
                      <div className="w-1 h-1 bg-gold-dim rounded-full" />
                    </div>
                    {/* Center circle */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-1.5 bg-background rounded-full border border-gold-dim flex items-center justify-center">
                        <span className="text-[6px] font-bold text-gold">$</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            <motion.div 
              className="absolute bottom-12 right-20 w-16 h-16 flex items-center justify-center"
              animate={{ 
                y: [0, -6, 0],
                rotate: [0, -3, 0]
              }}
              transition={{ 
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5
              }}
            >
              <div className="relative">
                {/* Green chips with details */}
                {[0, 2, 4].map((offset, i) => (
                  <motion.div 
                    key={i}
                    className="absolute w-12 h-3 rounded-full border-2 border-green-700 overflow-hidden" 
                    style={{ top: `${offset}px` }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 + i * 0.1 }}
                  >
                    {/* Chip face */}
                    <div className="absolute inset-0 bg-active" />
                    {/* Edge spots */}
                    <div className="absolute inset-0 flex items-center justify-around px-0.5">
                      <div className="w-0.5 h-0.5 bg-green-700 rounded-full" />
                      <div className="w-0.5 h-0.5 bg-green-700 rounded-full" />
                      <div className="w-0.5 h-0.5 bg-green-700 rounded-full" />
                    </div>
                    {/* Center circle */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-4 h-1 bg-background rounded-full border border-green-700" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            <motion.div 
              className="absolute top-1/2 left-1/3 w-12 h-12 flex items-center justify-center opacity-50"
              animate={{ 
                y: [0, -4, 0],
                rotate: [0, 2, 0]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1
              }}
            >
              <div className="relative">
                {/* Red chips with details */}
                {[0, 2].map((offset, i) => (
                  <motion.div 
                    key={i}
                    className="absolute w-10 h-2.5 rounded-full border-2 border-red-800 overflow-hidden" 
                    style={{ top: `${offset}px` }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 + i * 0.1 }}
                  >
                    {/* Chip face */}
                    <div className="absolute inset-0 bg-fold" />
                    {/* Edge spots */}
                    <div className="absolute inset-0 flex items-center justify-around px-0.5">
                      <div className="w-0.5 h-0.5 bg-red-800 rounded-full" />
                      <div className="w-0.5 h-0.5 bg-red-800 rounded-full" />
                    </div>
                    {/* Center circle */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-3 h-0.5 bg-background rounded-full border border-red-800" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            <div className="relative z-10">
              <div className="inline-block px-3 py-1 bg-surface-raised rounded-full text-xs font-medium text-zinc-400 mb-6 border border-zinc-800">
                Multi-party computation poker
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-zinc-100 mb-6 leading-tight">
                Play poker with
                <br />
                <span className="text-zinc-600">complete privacy</span>
              </h1>

              <p className="text-lg text-zinc-400 mb-8 max-w-xl">
                Encrypted cards, verifiable shuffles, and atomic reveals. 
                No trusted parties. Pure cryptography.
              </p>
            </div>

            {/* Poker card illustration */}
            <div className="absolute bottom-8 right-8 flex gap-2">
              {/* Ace of Spades */}
              <div className="w-16 h-24 bg-card-face rounded-lg shadow-lg transform rotate-6 border border-zinc-300 flex flex-col items-center justify-between p-1.5">
                <div className="text-suit-black text-xs font-bold">A</div>
                <div className="text-suit-black text-2xl">♠</div>
                <div className="text-suit-black text-xs font-bold rotate-180">A</div>
              </div>
              {/* King of Hearts */}
              <div className="w-16 h-24 bg-card-face rounded-lg shadow-lg transform -rotate-3 border border-zinc-300 flex flex-col items-center justify-between p-1.5">
                <div className="text-suit-red text-xs font-bold">K</div>
                <div className="text-suit-red text-2xl">♥</div>
                <div className="text-suit-red text-xs font-bold rotate-180">K</div>
              </div>
            </div>
          </motion.div>

          {/* Stats Card with Card Shuffle Animation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="col-span-12 lg:col-span-4 bg-surface rounded-3xl p-8 border border-zinc-800 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 rounded-full blur-2xl" />
            
            <div className="relative z-10">
              {/* <div className="text-sm text-zinc-500 mb-8">Card Shuffle</div> */}
              
              {/* Animated Card Shuffle */}
              <div className="relative h-48 flex items-center justify-center">
                {/* Create 8 cards for shuffle effect */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-20 h-28 bg-card-back rounded-lg border border-zinc-700 shadow-lg"
                    style={{
                      backgroundImage: 'linear-gradient(135deg, #1a3a6a 0%, #2a4a7a 100%)',
                    }}
                    animate={{
                      x: [
                        0,
                        Math.sin(i * Math.PI / 4) * 40,
                        Math.sin((i + 4) * Math.PI / 4) * 40,
                        0
                      ],
                      y: [
                        0,
                        Math.cos(i * Math.PI / 4) * 30,
                        Math.cos((i + 4) * Math.PI / 4) * 30,
                        0
                      ],
                      rotate: [
                        i * 5,
                        i * 5 + 180,
                        i * 5 + 360,
                        i * 5 + 360
                      ],
                      scale: [1, 1.1, 1.1, 1],
                      zIndex: i
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.1
                    }}
                  >
                    {/* Card back pattern */}
                    <div className="absolute inset-2 border border-zinc-600 rounded flex items-center justify-center">
                      <div className="text-zinc-700 text-xs font-bold opacity-50">
                        <div className="w-4 h-4 border-2 border-zinc-600 rounded-sm rotate-45" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              <div className="space-y-4 mt-12">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gold mb-1">MPC Shuffle</div>
                  <div className="text-xs text-zinc-600">Encrypted & Verifiable</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Feature Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="col-span-12 md:col-span-4 bg-surface rounded-3xl p-8 border border-zinc-900 hover:border-zinc-800 transition-colors group"
          >
            <div className="w-12 h-12 bg-surface-raised rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gold/10 transition-colors border border-zinc-800">
              <Shield className="w-6 h-6 text-gold" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-3">
              MPC Shuffle
            </h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Multi-party computation ensures no single party knows the card order. Cerberus protocol — dishonest majority secure.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="col-span-12 md:col-span-4 bg-surface rounded-3xl p-8 border border-zinc-900 hover:border-zinc-800 transition-colors group"
          >
            <div className="w-12 h-12 bg-surface-raised rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gold/10 transition-colors border border-zinc-800">
              <Eye className="w-6 h-6 text-gold" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-3">
              Encrypted Cards
            </h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Your hole cards are encrypted via Arcium MXE. Only you can decrypt them.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="col-span-12 md:col-span-4 bg-surface rounded-3xl p-8 border border-zinc-900 hover:border-zinc-800 transition-colors group"
          >
            <div className="w-12 h-12 bg-surface-raised rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gold/10 transition-colors border border-zinc-800">
              <Zap className="w-6 h-6 text-gold" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-3">
              Atomic Reveals
            </h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              All showdown reveals happen simultaneously. No selective disclosure.
            </p>
          </motion.div>

          {/* Tech Stack Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="col-span-12 bg-surface-raised rounded-3xl p-8 border border-zinc-800 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <div className="text-sm text-zinc-500 mb-2">Built on</div>
                <div className="flex items-center gap-6 flex-wrap">
                  <span className="text-zinc-100 font-medium">Solana</span>
                  <span className="text-zinc-700">•</span>
                  <span className="text-zinc-100 font-medium">Arcium MPC</span>
                  <span className="text-zinc-700">•</span>
                  <span className="text-zinc-100 font-medium">Anchor</span>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <a href="#" className="text-sm text-zinc-500 hover:text-zinc-100 transition-colors">
                  Documentation
                </a>
                <a href="#" className="text-sm text-zinc-500 hover:text-zinc-100 transition-colors">
                  GitHub
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-8 max-w-7xl mx-auto border-t border-zinc-900">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-600">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-surface-raised rounded-lg flex items-center justify-center border border-zinc-800">
              <div className="w-3 h-3 border border-gold rounded-sm rotate-45" />
            </div>
            <span>© 2026 CerberusPoker</span>
          </div>
          
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-zinc-100 transition-colors">Terms</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
