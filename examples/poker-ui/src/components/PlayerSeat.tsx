import React from 'react';
import { PlayingCard } from './PlayingCard';
import { SEAT_POSITIONS, PLAYER_AVATARS } from '../constants';
import type { Player } from '../hooks/useGameState';

interface PlayerSeatProps {
  player: Player;
  isActive: boolean;
  isHero: boolean;
  isDealer: boolean;
  showCards: boolean;
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  isActive,
  isHero,
  isDealer,
  showCards,
}) => {
  const pos = SEAT_POSITIONS[player.index] || SEAT_POSITIONS[0];

  const classes = [
    'player-seat',
    isActive ? 'active' : '',
    player.isFolded ? 'folded' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Hole Cards */}
      {player.holeCards.length > 0 && !player.isFolded && (
        <div className="seat-cards">
          {player.holeCards.map((card, i) => (
            <PlayingCard
              key={i}
              value={card}
              faceUp={isHero || showCards}
              small
              animationDelay={i * 150}
            />
          ))}
        </div>
      )}

      {/* Avatar */}
      <div className="seat-avatar">
        {PLAYER_AVATARS[player.index] || '👤'}
      </div>

      {/* Info */}
      <div className="seat-info">
        <div className="seat-name">
          {isDealer && '🔘 '}{player.name}
        </div>
        <div className="seat-stack">${player.stack.toLocaleString()}</div>
      </div>

      {/* Last Action Badge */}
      {player.lastAction && (
        <div className={`seat-action-badge ${player.lastAction.toLowerCase().split(' ')[0]}`}>
          {player.lastAction}
        </div>
      )}
    </div>
  );
};
