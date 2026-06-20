import { useState } from 'react';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import { GameState } from './types';

export default function App() {
  const [page, setPage] = useState<'lobby' | 'game'>('lobby');
  const [gameState, setGameState] = useState<GameState | null>(null);

  const handleGameStart = (state: GameState) => {
    setGameState(state);
    setPage('game');
  };

  const handleLeave = () => {
    setGameState(null);
    setPage('lobby');
  };

  if (page === 'game' && gameState) {
    return <Game gameState={gameState} onLeave={handleLeave} />;
  }

  return <Lobby onGameStart={handleGameStart} />;
}
