import React from 'react';
import { decodeCard } from '../constants';

interface PlayingCardProps {
  value?: number;       // 0-51 card value
  faceUp?: boolean;
  small?: boolean;
  animationDelay?: number;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  value,
  faceUp = false,
  small = false,
  animationDelay = 0,
}) => {
  if (!faceUp || value === undefined) {
    return (
      <div
        className={`playing-card face-down ${small ? 'sm' : ''} animate-card-deal`}
        style={{ animationDelay: `${animationDelay}ms` }}
      />
    );
  }

  const card = decodeCard(value);

  return (
    <div
      className={`playing-card face-up ${card.isRed ? 'red' : ''} ${small ? 'sm' : ''} animate-card-deal`}
      style={{ animationDelay: `${animationDelay}ms` }}
      title={`${card.rankSymbol} of ${card.suitName}`}
    >
      <span className="card-rank">{card.rankSymbol}</span>
      <span className="card-suit">{card.suitSymbol}</span>
    </div>
  );
};
