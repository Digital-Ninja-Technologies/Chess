import { Color } from '../types';
import { formatTime } from '../hooks/useTimer';

interface PlayerCardProps {
  name: string;
  color: Color;
  timeMs: number;
  isActive: boolean;
  capturedPieces: string[];
  isYou: boolean;
}

const PIECE_SYMBOLS: Record<string, string> = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕',
};

export default function PlayerCard({ name, color, timeMs, isActive, capturedPieces, isYou }: PlayerCardProps) {
  const isLow = timeMs < 30000;
  const isCritical = timeMs < 10000;

  return (
    <div className={`player-card ${isActive ? 'active' : ''} ${color}`}>
      <div className="player-info">
        <div className="player-avatar" style={{ background: color === 'white' ? '#eeeed2' : '#312e2b', color: color === 'white' ? '#312e2b' : '#eeeed2' }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="player-meta">
          <span className="player-name">
            {name} {isYou && <span className="you-badge">You</span>}
          </span>
          <div className="captured-pieces">
            {capturedPieces.map((p, i) => (
              <span key={i} className="captured-piece">{PIECE_SYMBOLS[p] || p}</span>
            ))}
          </div>
        </div>
      </div>
      <div className={`timer ${isActive ? 'running' : ''} ${isLow ? 'low' : ''} ${isCritical ? 'critical' : ''}`}>
        {formatTime(timeMs)}
      </div>
    </div>
  );
}
