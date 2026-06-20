import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { GameState, Color } from '../types';

interface LobbyProps {
  onGameStart: (state: GameState) => void;
}

const TIME_OPTIONS = [
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
];

export default function Lobby({ onGameStart }: LobbyProps) {
  const { socket, emit, on, off } = useSocket();
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [timeControl, setTimeControl] = useState(600);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [tab, setTab] = useState<'create' | 'join'>('create');

  const name = playerName.trim() || 'Anonymous';

  useEffect(() => {
    const cleanupCreated = on('room-created', ((data: { roomId: string; color: Color; timeControl: number }) => {
      setCreatedRoomId(data.roomId);
      setStatus('waiting');
    }) as (...args: unknown[]) => void);

    const cleanupOpponent = on('opponent-joined', ((data: GameState & { color: Color }) => {
      onGameStart({
        roomId: data.roomId,
        playerColor: data.color,
        playerName: name,
        opponentName: data.players.find(p => p.color !== data.color)?.name || 'Opponent',
        fen: data.fen,
        timers: data.timers,
        timeControl: data.timeControl,
        players: data.players,
      });
    }) as (...args: unknown[]) => void);

    const cleanupJoined = on('room-joined', ((data: { roomId: string; color: Color; players: GameState['players']; fen: string; timers: GameState['timers']; timeControl: number }) => {
      onGameStart({
        roomId: data.roomId,
        playerColor: data.color,
        playerName: name,
        opponentName: data.players.find(p => p.color !== data.color)?.name || 'Opponent',
        fen: data.fen,
        timers: data.timers,
        timeControl: data.timeControl,
        players: data.players,
      });
    }) as (...args: unknown[]) => void);

    const cleanupError = on('join-error', ((data: { message: string }) => {
      setErrorMsg(data.message);
      setStatus('error');
    }) as (...args: unknown[]) => void);

    return () => {
      cleanupCreated();
      cleanupOpponent();
      cleanupJoined();
      cleanupError();
    };
  }, [on, off, onGameStart, name]);

  const handleCreate = () => {
    if (!socket.current?.connected) {
      setErrorMsg('Not connected to server. Please wait...');
      setStatus('error');
      return;
    }
    emit('create-room', { timeControl, playerName: name });
    setStatus('waiting');
    setErrorMsg('');
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    if (!socket.current?.connected) {
      setErrorMsg('Not connected to server. Please wait...');
      setStatus('error');
      return;
    }
    emit('join-room', { roomId: code, playerName: name });
    setErrorMsg('');
  };

  return (
    <div className="lobby">
      <div className="lobby-hero">
        <div className="lobby-logo">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">
            <rect width="64" height="64" rx="12" fill="#81b64c"/>
            <text x="12" y="48" fontSize="44" fill="white">♟</text>
          </svg>
          <span>ChessLive</span>
        </div>
        <p className="lobby-tagline">Play chess with voice & video chat</p>
      </div>

      <div className="lobby-card">
        <div className="lobby-name-row">
          <input
            type="text"
            placeholder="Your name (optional)"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            className="input"
            maxLength={20}
          />
        </div>

        <div className="tab-bar">
          <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
            Create Game
          </button>
          <button className={`tab-btn ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>
            Join Game
          </button>
        </div>

        {tab === 'create' && (
          <div className="tab-content">
            <div className="time-control-grid">
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.seconds}
                  className={`time-btn ${timeControl === opt.seconds ? 'active' : ''}`}
                  onClick={() => setTimeControl(opt.seconds)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {status === 'waiting' && createdRoomId ? (
              <div className="waiting-box">
                <p>Share this code with your opponent:</p>
                <div className="room-code">{createdRoomId}</div>
                <div className="waiting-spinner">
                  <span className="spinner" />
                  Waiting for opponent to join…
                </div>
              </div>
            ) : (
              <button className="btn-primary" onClick={handleCreate}>
                Create Game
              </button>
            )}
          </div>
        )}

        {tab === 'join' && (
          <div className="tab-content">
            <input
              type="text"
              placeholder="Enter room code (e.g. AB12CD)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              className="input code-input"
              maxLength={6}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            <button className="btn-primary" onClick={handleJoin} disabled={joinCode.trim().length < 4}>
              Join Game
            </button>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="error-msg">{errorMsg}</div>
        )}
      </div>

      <div className="lobby-features">
        <div className="feature">
          <span className="feature-icon">♟</span>
          <span>Full chess rules</span>
        </div>
        <div className="feature">
          <span className="feature-icon">🎙</span>
          <span>Voice chat</span>
        </div>
        <div className="feature">
          <span className="feature-icon">📹</span>
          <span>Video call</span>
        </div>
        <div className="feature">
          <span className="feature-icon">⏱</span>
          <span>Chess clock</span>
        </div>
      </div>
    </div>
  );
}
