import { useQuery } from '@tanstack/react-query';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '../lib/anchor';
import type { GameSession, PokerTable } from '../types';

const ZERO_PUBKEY = PublicKey.default.toBase58();

function isUsablePubkey(pubkey: PublicKey | undefined | null): pubkey is PublicKey {
  return !!pubkey && pubkey.toBase58() !== ZERO_PUBKEY;
}

async function fetchTokenBalance(account: PublicKey): Promise<bigint> {
  try {
    const balance = await getConnection().getTokenAccountBalance(account);
    return BigInt(balance.value.amount);
  } catch {
    return 0n;
  }
}

/**
 * Fetch player stack token balances for the current table.
 *
 * `player_stacks` is populated once a player posts blinds or acts. Before that,
 * the hook falls back to each player's associated token account for the table
 * mint so lobby/pre-action seats still show a usable stack when the ATA exists.
 */
export function useTableTokenBalances(
  pokerTable: PokerTable | null | undefined,
  gameSession: GameSession | null | undefined
) {
  const stackKeys = pokerTable?.playerStacks?.map((key) => key.toBase58()).join(',');
  const playerKeys = gameSession?.players?.map((key) => key.toBase58()).join(',');
  const potMintKey = pokerTable?.potMint?.toBase58();

  return useQuery({
    queryKey: ['tableTokenBalances', stackKeys, playerKeys, potMintKey],
    queryFn: async () => {
      if (!pokerTable || !gameSession) return Array<bigint>(10).fill(0n);

      const balances = Array<bigint>(10).fill(0n);
      const potMint = pokerTable.potMint;

      await Promise.all(
        Array.from({ length: Math.min(gameSession.numPlayers, 10) }, async (_, playerIndex) => {
          const stackAccount = pokerTable.playerStacks[playerIndex];
          let accountToFetch = isUsablePubkey(stackAccount) ? stackAccount : null;

          if (!accountToFetch && isUsablePubkey(potMint)) {
            const owner = gameSession.players[playerIndex];
            if (isUsablePubkey(owner)) {
              accountToFetch = getAssociatedTokenAddressSync(potMint, owner);
            }
          }

          if (accountToFetch) {
            balances[playerIndex] = await fetchTokenBalance(accountToFetch);
          }
        })
      );

      return balances;
    },
    enabled: !!pokerTable && !!gameSession,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
