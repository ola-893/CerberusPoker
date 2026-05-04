import React from 'react';

interface BettingControlsProps {
  currentBet: number;
  betAmount: number;
  playerStack: number;
  bigBlind: number;
  onBetAmountChange: (amount: number) => void;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: () => void;
  onAllIn: () => void;
  disabled: boolean;
}

export const BettingControls: React.FC<BettingControlsProps> = ({
  currentBet,
  betAmount,
  playerStack,
  bigBlind,
  onBetAmountChange,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onAllIn,
  disabled,
}) => {
  const canCheck = currentBet === 0;
  const minRaise = currentBet * 2 || bigBlind * 2;
  const maxBet = playerStack;

  return (
    <div className="betting-controls" id="betting-controls">
      <button className="btn btn-danger" onClick={onFold} disabled={disabled} id="btn-fold">
        Fold
      </button>

      {canCheck ? (
        <button className="btn btn-ghost" onClick={onCheck} disabled={disabled} id="btn-check">
          Check
        </button>
      ) : (
        <button className="btn btn-success" onClick={onCall} disabled={disabled} id="btn-call">
          Call ${currentBet}
        </button>
      )}

      <div className="bet-slider-group">
        <input
          type="range"
          className="bet-slider"
          min={minRaise}
          max={maxBet}
          step={bigBlind}
          value={betAmount}
          onChange={(e) => onBetAmountChange(Number(e.target.value))}
          disabled={disabled}
          id="bet-slider"
        />
        <div className="bet-amount-display">${betAmount}</div>
      </div>

      <button
        className="btn btn-primary"
        onClick={onRaise}
        disabled={disabled || betAmount > playerStack}
        id="btn-raise"
      >
        Raise
      </button>

      <button className="btn btn-ghost" onClick={onAllIn} disabled={disabled} id="btn-allin"
        style={{ borderColor: 'rgba(139, 92, 246, 0.3)', color: '#8b5cf6' }}
      >
        All-In
      </button>
    </div>
  );
};
