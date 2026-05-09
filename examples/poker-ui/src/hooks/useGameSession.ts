/**
 * useGameSession — fetches and subscribes to the GameSession PDA on-chain
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { useAnchorPrograms, deriveGameSessionPDA, getConnection } from '../lib/anchor';
import { GameSession, GameState } from '../types';

/** Map raw Anchor account data → our GameSession type */
function parseGameSession(raw: any): GameSession {
  // GameState enum from Anchor comes as an object like { active: {} }
  const stateKey = Object.keys(raw.state)[0];
  const stateMap: Record<string, GameState> = {
    lobby:    GameState.Lobby,
    shuffle:  GameState.Shuffle,
    deal:     GameState.Deal,
    active:   GameState.Active,
    showdown: GameState.Showdown,
    complete: GameState.Complete,
  };

  return {
    gameId:                  BigInt(raw.gameId.toString()),
    state:                   stateMap[stateKey] ?? GameState.Lobby,
    maxPlayers:              raw.maxPlayers,
    deckSize:                raw.deckSize,
    numPlayers:              raw.numPlayers,
    players:                 (raw.players as PublicKey[]).slice(0, raw.numPlayers),
    activeComputationOffset: BigInt(raw.activeComputationOffset.toString()),
    encryptedDeckHash:       new Uint8Array(raw.encryptedDeckHash),
    shuffleBitmap:           raw.shuffleBitmap,
    revealBitmap:            (raw.revealBitmap as any[]).map((v: any) => BigInt(v.toString())),
    unmaskedCards:           Array.from(raw.unmaskedCards as number[]),
    cardAssignedTo:          Array.from(raw.cardAssignedTo as number[]),
    cardValueUsed:           (raw.cardValueUsed as any[]).map((v: any) => BigInt(v.toString())),
    createdAt:               BigInt(raw.createdAt.toString()),
    shuffleDeadline:         BigInt(raw.shuffleDeadline.toString()),
    revealDeadline:          BigInt(raw.revealDeadline.toString()),
    bump:                    raw.bump,
  };
}

export function useGameSession(gameId: string | null) {
  const programs = useAnchorPrograms();
  const queryClient = useQueryClient();

  const gameIdBigInt = gameId ? (() => {
    try {
      if (/^[0-9a-fA-F]+$/.test(gameId) && isNaN(Number(gameId))) {
        return BigInt('0x' + gameId);
      }
      return BigInt(gameId);
    } catch {
      return null;
    }
  })() : null;

  // Derive PDA
  const pda = gameIdBigInt !== null
    ? deriveGameSessionPDA(gameIdBigInt)[0]
    : null;

  const query = useQuery({
    queryKey: ['gameSession', gameId],
    queryFn: async (): Promise<GameSession | null> => {
      if (!programs || !pda || gameIdBigInt === null) return null;

      try {
        const raw = await programs.cerberusPoker.account['gameSession'].fetch(pda);
        return parseGameSession(raw);
      } catch (err: any) {
        // Account doesn't exist yet (game not created)
        if (err?.message?.includes('Account does not exist')) return null;
        throw err;
      }
    },
    enabled: !!programs && !!pda,
    refetchInterval: false,
    staleTime: Infinity,
    retry: 1,
  });

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!pda || !programs) return;

    const connection = getConnection();
    const subId = connection.onAccountChange(
      pda,
      () => {
        // Invalidate query to trigger re-fetch when account changes
        queryClient.invalidateQueries({ queryKey: ['gameSession', gameId] });
      },
      'confirmed'
    );

    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [pda?.toBase58(), programs, gameId, queryClient]);

  return query;
}
