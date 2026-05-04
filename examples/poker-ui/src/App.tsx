import React, { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { PlayingCard } from './components/PlayingCard';
import { PlayerSeat } from './components/PlayerSeat';
import { BettingControls } from './components/BettingControls';
import { PROGRAM_IDS } from './constants';

/** Phase display labels */
const PHASE_LABELS: Record<string, { label: string; cls: string }> = {
  shuffle: { label: '🔀 Shuffling Deck...', cls: 'shuffle' },
  deal: { label: '🃏 Dealing Cards...', cls: 'deal' },
  preflop: { label: '🎯 Pre-Flop', cls: 'betting' },
  flop: { label: '🎯 Flop', cls: 'betting' },
  turn: { label: '🎯 Turn', cls: 'betting' },
  river: { label: '🎯 River', cls: 'betting' },
  showdown: { label: '🏆 Showdown', cls: 'showdown' },
};

export default function App() {
  const {
    state, betAmount, setBetAmount, isHeroTurn, visibleCommunityCards,
    createGame, startGame, playerAction, advancePhase, resetGame,
  } = useGameState();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createConfig, setCreateConfig] = useState({ players: 6, smallBlind: 50, bigBlind: 100 });
  const [joinId, setJoinId] = useState('');

  const heroPlayer = state.players[state.heroIndex];
  const phaseInfo = PHASE_LABELS[state.phase];

  // ─── Lobby Screen ───────────────────────────────────────────────────
  if (state.phase === 'lobby' && !state.gameId) {
    return (
      <div className="app-container">
        <Header />
        <div className="lobby">
          <div className="lobby-hero">
            <h2>Texas Hold'em on Solana</h2>
            <p>
              Fully private multiplayer poker powered by Arcium MPC.
              No one sees your cards — not even the server.
            </p>
          </div>
          <div className="lobby-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setShowCreateModal(true)} id="btn-create-table">
              Create Table
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => setShowJoinModal(true)} id="btn-join-table">
              Join Table
            </button>
          </div>
          <div className="lobby-tables">
            <h3>Recent Tables</h3>
            <div className="table-list">
              {['GAME-X7K2M9', 'GAME-P3N8QR', 'GAME-L5B1DF'].map((id, i) => (
                <div className="table-row" key={id}>
                  <span className="table-id">{id}</span>
                  <span className="table-players">{2 + i}/6 players</span>
                  <span className="table-blinds">50/100</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => {
                    createGame(6, { small: 50, big: 100 });
                  }}>Join</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Create Table</h3>
              <div className="modal-field">
                <label>Players</label>
                <select value={createConfig.players}
                  onChange={e => setCreateConfig(c => ({ ...c, players: +e.target.value }))}>
                  {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Players</option>)}
                </select>
              </div>
              <div className="modal-field">
                <label>Small Blind</label>
                <input type="number" value={createConfig.smallBlind}
                  onChange={e => setCreateConfig(c => ({ ...c, smallBlind: +e.target.value }))} />
              </div>
              <div className="modal-field">
                <label>Big Blind</label>
                <input type="number" value={createConfig.bigBlind}
                  onChange={e => setCreateConfig(c => ({ ...c, bigBlind: +e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => {
                  createGame(createConfig.players, { small: createConfig.smallBlind, big: createConfig.bigBlind });
                  setShowCreateModal(false);
                }}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Join Modal */}
        {showJoinModal && (
          <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Join Table</h3>
              <div className="modal-field">
                <label>Table ID</label>
                <input placeholder="GAME-XXXXXX" value={joinId}
                  onChange={e => setJoinId(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowJoinModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => {
                  createGame(6, { small: 50, big: 100 });
                  setShowJoinModal(false);
                }}>Join</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Waiting Lobby (game created, waiting for start) ────────────────
  if (state.phase === 'lobby' && state.gameId) {
    return (
      <div className="app-container">
        <Header gameId={state.gameId} />
        <div className="lobby">
          <div className="lobby-hero animate-fade-in">
            <h2>Waiting for Players</h2>
            <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontSize: '1.2rem', margin: '12px 0' }}>
              {state.gameId}
            </p>
            <p>{state.players.length} / 6 players connected</p>
          </div>
          <div className="progress-steps">
            {state.players.map((p, i) => (
              <div key={i} className={`progress-step ${p.isConnected ? 'done' : ''}`} />
            ))}
          </div>
          <div className="lobby-actions">
            <button className="btn btn-primary btn-lg" onClick={startGame} id="btn-start-game">
              Start Game
            </button>
            <button className="btn btn-ghost btn-lg" onClick={resetGame}>
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Complete (Winner) ──────────────────────────────────────────────
  if (state.phase === 'complete' && state.winnerId !== undefined) {
    const winner = state.players[state.winnerId];
    return (
      <div className="app-container">
        <Header gameId={state.gameId} />
        <div className="winner-overlay">
          <div className="winner-card">
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🏆</div>
            <h2>{winner?.name || 'Unknown'} Wins!</h2>
            {state.winnerHand && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>{state.winnerHand}</p>
            )}
            <div className="winner-amount">+${state.pot.toLocaleString()}</div>
            <button className="btn btn-primary btn-lg" onClick={resetGame} id="btn-new-game">
              New Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Game Table ─────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <Header gameId={state.gameId} />

      <div className="poker-table-container">
        {/* Phase Banner */}
        {phaseInfo && (
          <div className={`phase-banner ${phaseInfo.cls}`}>
            {phaseInfo.label}
            {isHeroTurn && <span style={{ marginLeft: 8 }}>• Your Turn</span>}
          </div>
        )}

        {/* Table */}
        <div className="poker-table" id="poker-table">
          {/* Pot */}
          <div className="pot-display">
            <div className="pot-label">Pot</div>
            <div className="pot-amount">${state.pot.toLocaleString()}</div>
          </div>

          {/* Community Cards */}
          <div className="community-cards" id="community-cards">
            {visibleCommunityCards.map((card, i) => (
              <PlayingCard key={i} value={card} faceUp animationDelay={i * 200} />
            ))}
          </div>

          {/* Player Seats */}
          {state.players.map(player => (
            <PlayerSeat
              key={player.index}
              player={player}
              isActive={state.currentPlayerIndex === player.index}
              isHero={player.index === state.heroIndex}
              isDealer={state.dealerIndex === player.index}
              showCards={state.phase === 'showdown' || state.phase === 'complete'}
            />
          ))}
        </div>

        {/* Betting Controls — only show when it's hero's turn */}
        {isHeroTurn && heroPlayer && (
          <BettingControls
            currentBet={state.currentBet}
            betAmount={betAmount}
            playerStack={heroPlayer.stack}
            bigBlind={state.bigBlind}
            onBetAmountChange={setBetAmount}
            onFold={() => playerAction('fold')}
            onCheck={() => playerAction('check')}
            onCall={() => playerAction('call')}
            onRaise={() => playerAction('raise')}
            onAllIn={() => playerAction('allin')}
            disabled={false}
          />
        )}

        {/* Dev Controls — advance phase (for demo) */}
        {!isHeroTurn && state.phase !== 'complete' && (
          <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              // Simulate other players acting
              playerAction('call');
            }}>
              Simulate Action
            </button>
            <button className="btn btn-ghost btn-sm" onClick={advancePhase}>
              Next Phase →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Header Component ───────────────────────────────────────────────────
function Header({ gameId }: { gameId?: string }) {
  return (
    <header className="header">
      <div className="header-logo">
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" stroke="url(#grad)" strokeWidth="2.5" />
          <path d="M10 20l6-12 6 12" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32">
              <stop stopColor="#f59e0b" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>
        <h1>CerberusPoker</h1>
      </div>
      <div className="header-nav">
        {gameId && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {gameId}
          </span>
        )}
        <div className="header-badge">
          <span className="dot" />
          Devnet
        </div>
        <button className="btn btn-ghost btn-sm" id="btn-connect-wallet">
          Connect Wallet
        </button>
      </div>
    </header>
  );
}
