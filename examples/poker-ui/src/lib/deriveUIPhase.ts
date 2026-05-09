import { GameState, PokerPhase, UIPhase } from '../types';

/**
 * Derive UIPhase from GameState and PokerPhase
 * 
 * Important: GameState::Showdown is never set by the backend.
 * Showdown is signalled by PokerPhase::Showdown on texas_holdem.
 */
export function deriveUIPhase(
  gameState: GameState | null | undefined,
  pokerPhase: PokerPhase | null | undefined,
  sawShowdownComplete: boolean = false
): UIPhase {
  if (!gameState) return UIPhase.Connecting;

  switch (gameState) {
    case GameState.Lobby:
      return UIPhase.Lobby;
    
    case GameState.Shuffle:
      return UIPhase.Shuffle;
    
    case GameState.Deal:
      return UIPhase.Deal;
    
    case GameState.Active:
      if (!pokerPhase) return UIPhase.PreFlop;
      
      switch (pokerPhase) {
        case PokerPhase.PreFlop:
          return UIPhase.PreFlop;
        case PokerPhase.Flop:
          return UIPhase.Flop;
        case PokerPhase.Turn:
          return UIPhase.Turn;
        case PokerPhase.River:
          return UIPhase.River;
        case PokerPhase.Showdown:
          return UIPhase.Showdown;
        case PokerPhase.Complete:
          return UIPhase.Complete;
        default:
          return UIPhase.PreFlop;
      }
    
    case GameState.Complete:
      return sawShowdownComplete ? UIPhase.Complete : UIPhase.Aborted;
    
    default:
      return UIPhase.Connecting;
  }
}
