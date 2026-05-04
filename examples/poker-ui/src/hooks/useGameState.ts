import { useState, useCallback } from 'react';
import { decodeCard } from '../constants';

/** Game phases */
export type GamePhase = 'lobby' | 'shuffle' | 'deal' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

/** Player state */
export interface Player {
  index: number;
  name: string;
  stack: number;
  isFolded: boolean;
  isAllIn: boolean;
  isConnected: boolean;
  lastAction?: string;
  holeCards: number[];  // card values (0-51), empty if hidden
}

/** Game state */
export interface GameState {
  gameId: string;
  phase: GamePhase;
  players: Player[];
  communityCards: number[];
  pot: number;
  currentBet: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  heroIndex: number;     // which seat is the local player
  winnerId?: number;
  winnerHand?: string;
}

const DEFAULT_STATE: GameState = {
  gameId: '',
  phase: 'lobby',
  players: [],
  communityCards: [],
  pot: 0,
  currentBet: 0,
  currentPlayerIndex: 0,
  dealerIndex: 0,
  smallBlind: 50,
  bigBlind: 100,
  heroIndex: 0,
};

/** Demo players for local testing */
function createDemoPlayers(count: number): Player[] {
  const names = ['You', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    name: names[i] || `Player ${i}`,
    stack: 10000,
    isFolded: false,
    isAllIn: false,
    isConnected: true,
    holeCards: [],
  }));
}

export function useGameState() {
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const [betAmount, setBetAmount] = useState(0);

  const createGame = useCallback((playerCount: number, blinds: { small: number; big: number }) => {
    const id = `GAME-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setState({
      ...DEFAULT_STATE,
      gameId: id,
      phase: 'lobby',
      players: createDemoPlayers(playerCount),
      smallBlind: blinds.small,
      bigBlind: blinds.big,
      currentBet: blinds.big,
    });
    setBetAmount(blinds.big * 2);
  }, []);

  const startGame = useCallback(() => {
    setState(prev => {
      // Deal 2 hole cards to each player
      const cards = Array.from({ length: 52 }, (_, i) => i);
      // Fisher-Yates shuffle
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      let ci = 0;
      const players = prev.players.map(p => ({
        ...p,
        holeCards: [cards[ci++], cards[ci++]],
        stack: p.stack - (p.index === 1 ? prev.smallBlind : p.index === 2 ? prev.bigBlind : 0),
      }));
      return {
        ...prev,
        phase: 'preflop',
        players,
        pot: prev.smallBlind + prev.bigBlind,
        currentPlayerIndex: 3 % prev.players.length,
        dealerIndex: 0,
        communityCards: cards.slice(ci, ci + 5), // reserve 5 for community
      };
    });
  }, []);

  const playerAction = useCallback((action: 'fold' | 'check' | 'call' | 'raise' | 'allin') => {
    setState(prev => {
      const cp = prev.currentPlayerIndex;
      const players = [...prev.players];
      const player = { ...players[cp] };
      let pot = prev.pot;
      let currentBet = prev.currentBet;

      switch (action) {
        case 'fold':
          player.isFolded = true;
          player.lastAction = 'Fold';
          break;
        case 'check':
          player.lastAction = 'Check';
          break;
        case 'call':
          player.stack -= currentBet;
          pot += currentBet;
          player.lastAction = 'Call';
          break;
        case 'raise':
          player.stack -= betAmount;
          pot += betAmount;
          currentBet = betAmount;
          player.lastAction = `Raise ${betAmount}`;
          break;
        case 'allin':
          pot += player.stack;
          player.lastAction = 'All-In';
          player.isAllIn = true;
          player.stack = 0;
          break;
      }

      players[cp] = player;

      // Find next active player
      let next = (cp + 1) % players.length;
      let rounds = 0;
      while ((players[next].isFolded || players[next].isAllIn) && rounds < players.length) {
        next = (next + 1) % players.length;
        rounds++;
      }

      // Check if round is over (came back to same player or only 1 active)
      const activePlayers = players.filter(p => !p.isFolded && !p.isAllIn);
      if (activePlayers.length <= 1) {
        // Winner by fold
        const winner = players.find(p => !p.isFolded)!;
        return { ...prev, players, pot, currentBet, phase: 'complete' as GamePhase, winnerId: winner.index, currentPlayerIndex: next };
      }

      return { ...prev, players, pot, currentBet, currentPlayerIndex: next };
    });
  }, [betAmount]);

  const advancePhase = useCallback(() => {
    setState(prev => {
      const phases: GamePhase[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
      const idx = phases.indexOf(prev.phase);
      if (idx === -1 || idx >= phases.length - 1) {
        // Showdown - determine winner
        const active = prev.players.filter(p => !p.isFolded);
        const winnerId = active[Math.floor(Math.random() * active.length)]?.index ?? 0;
        return { ...prev, phase: 'complete', winnerId, winnerHand: 'Full House' };
      }
      const nextPhase = phases[idx + 1];
      // Reset last actions
      const players = prev.players.map(p => ({ ...p, lastAction: undefined }));
      return { ...prev, phase: nextPhase, players, currentPlayerIndex: 1 };
    });
  }, []);

  const resetGame = useCallback(() => {
    setState(DEFAULT_STATE);
    setBetAmount(0);
  }, []);

  const isHeroTurn = state.currentPlayerIndex === state.heroIndex && state.phase !== 'lobby' && state.phase !== 'complete' && state.phase !== 'shuffle' && state.phase !== 'deal';

  const visibleCommunityCards = (() => {
    switch (state.phase) {
      case 'flop': return state.communityCards.slice(0, 3);
      case 'turn': return state.communityCards.slice(0, 4);
      case 'river':
      case 'showdown':
      case 'complete':
        return state.communityCards.slice(0, 5);
      default: return [];
    }
  })();

  return {
    state,
    betAmount,
    setBetAmount,
    isHeroTurn,
    visibleCommunityCards,
    createGame,
    startGame,
    playerAction,
    advancePhase,
    resetGame,
  };
}
