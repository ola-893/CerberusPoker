/**
 * useWalletBalances — fetches SOL and devnet USDC balances for the connected wallet
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection } from '../lib/anchor';

// Devnet USDC mint (Circle's official devnet USDC)
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

async function getUsdcBalance(connection: Connection, walletPubkey: PublicKey): Promise<number> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: DEVNET_USDC_MINT,
    });

    if (tokenAccounts.value.length === 0) return 0;

    const balance = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    return balance;
  } catch {
    return 0;
  }
}

export function useWalletBalances() {
  const { publicKey } = useWallet();

  return useQuery({
    queryKey: ['walletBalances', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return { sol: 0, usdc: 0 };

      const connection = getConnection();

      const [lamports, usdc] = await Promise.all([
        connection.getBalance(publicKey),
        getUsdcBalance(connection, publicKey),
      ]);

      return {
        sol:  lamports / LAMPORTS_PER_SOL,
        usdc,
      };
    },
    enabled: !!publicKey,
    refetchInterval: 30_000, // refresh every 30s
    staleTime: 15_000,
  });
}
