import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useTimer } from '../hooks/useTimer';
import VideoPanel from '../components/VideoPanel';
import PlayerCard from '../components/PlayerCard';
import MoveList from '../components/MoveList';
import Chat from '../components/Chat';
import { GameState, ChatMessage, Color, GameResult } from '../types';

interface GameProps {
  gameState: GameState;
  onLeave: () => void;
}

function getCapturedPieces(fen: string, color: Color): string[] {
  // Parse FEN and determine captured pieces
  const game = new Chess(fen);
  const board = game.board();
  const onBoard: Record<string, number> = {};
  board.flat().forEach(sq => {
    if (sq) {
      const key = color === 'white' ? sq.type.toUpperCase() : sq.type;
      onBoard[key] = (onBoard[key] || 0) + 1;
    }
  });

  const initial: Record<string, number> = color === 'white'
    ? { P: 8, N: 2, B: 2, R: 2, Q: 1 }
    : { p: 8, n: 2, b: 2, r: 2, q: 1 };

  const captured: string[] = [];
  for (const [piece, count] of Object.entries(initial)) {
    const remaining = onBoard[piece] || 0;
    for (let i = 0; i < count - remaining; i++) {
      captured.push(piece);
    }
  }
  return captured;
}

export default function Game({ gameState, onLeave }: GameProps) {
  const { socket, emit, on } = useSocket();
  const [chess] = useState(() => {
    const g = new Chess();
    if (gameState.fen !== 'start') g.load(gameState.fen);
    return g;
  });
  const [fen, setFen] = useState(chess.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<GameResult | null>(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [activeColor, setActiveColor] = useState<Color>('white');
  const [customSquares, setCustomSquares] = useState<Record<string, React.CSSProperties>>({});
  const [showPromotion, setShowPromotion] = useState(false);
  const chessRef = useRef(chess);
  chessRef.current = chess;

  const isMyTurn = activeColor === gameState.playerColor;
  const isWhite = gameState.playerColor === 'white';

  const webrtc = useWebRTC({
    socket: socket.current,
    roomId: gameState.roomId,
    isInitiator: isWhite,
  });

  const handleTimeout = useCallback((color: Color) => {
    const winner: Color = color === 'white' ? 'black' : 'white';
    emit('game-over', { roomId: gameState.roomId, result: winner, reason: 'timeout' });
    setResult({ result: winner, reason: 'timeout' });
  }, [emit, gameState.roomId]);

  const { timers, syncTimers } = useTimer({
    initialTimers: gameState.timers,
    activeColor,
    running: !result && moveHistory.length > 0,
    onTimeout: handleTimeout,
  });

  // Highlight last move
  const highlightLastMove = useCallback((moves: string[]) => {
    const lastMoveStr = moves[moves.length - 1];
    if (!lastMoveStr) { setCustomSquares({}); return; }
    const g = chessRef.current;
    const history = g.history({ verbose: true });
    const lastMove = history[history.length - 1];
    if (!lastMove) return;
    setCustomSquares({
      [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.25)' },
      [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.25)' },
    });
  }, []);

  // Socket event listeners
  useEffect(() => {
    const cleanupMove = on('opponent-move', ((data: { move: string; fen: string; timers: GameState['timers'] }) => {
      const g = chessRef.current;
      try {
        g.move(data.move);
        const newFen = g.fen();
        setFen(newFen);
        setActiveColor(g.turn() === 'w' ? 'white' : 'black');
        syncTimers(data.timers);
        setMoveHistory(prev => {
          const next = [...prev, data.move];
          highlightLastMove(next);
          return next;
        });
      } catch (e) {
        console.error('Invalid opponent move:', data.move, e);
      }
    }) as (...args: unknown[]) => void);

    const cleanupEnd = on('game-ended', ((data: GameResult) => {
      setResult(data);
    }) as (...args: unknown[]) => void);

    const cleanupDrawOffer = on('draw-offered', (() => {
      setDrawOffered(true);
    }) as (...args: unknown[]) => void);

    const cleanupDrawDecline = on('draw-declined', (() => {
      setDrawOffered(false);
    }) as (...args: unknown[]) => void);

    const cleanupChat = on('chat-message', ((msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    }) as (...args: unknown[]) => void);

    return () => {
      cleanupMove();
      cleanupEnd();
      cleanupDrawOffer();
      cleanupDrawDecline();
      cleanupChat();
    };
  }, [on, syncTimers, highlightLastMove]);

  // Auto-start WebRTC when opponent connects (white starts as initiator)
  useEffect(() => {
    const handleOpponentJoined = (() => {
      webrtc.startCall();
    }) as (...args: unknown[]) => void;
    const cleanup = on('opponent-joined', handleOpponentJoined);
    // Black joins, so start call when already in game
    if (gameState.playerColor === 'black') {
      webrtc.startCall();
    }
    return cleanup;
  }, []); // eslint-disable-line

  const onDrop = useCallback((sourceSquare: Square, targetSquare: Square, piece: string): boolean => {
    if (!isMyTurn || result) return false;
    const g = chessRef.current;
    const isPromotion = piece[1] === 'P' && ((gameState.playerColor === 'white' && targetSquare[1] === '8') || (gameState.playerColor === 'black' && targetSquare[1] === '1'));

    try {
      const move = g.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? 'q' : undefined,
      });
      if (!move) return false;

      const newFen = g.fen();
      const newTimers = { ...timers };
      setFen(newFen);
      setActiveColor(g.turn() === 'w' ? 'white' : 'black');

      const newHistory = [...moveHistory, move.san];
      setMoveHistory(newHistory);
      highlightLastMove(newHistory);

      emit('move', { roomId: gameState.roomId, move: move.san, fen: newFen, timers: newTimers });

      // Check game end
      if (g.isGameOver()) {
        let res: GameResult;
        if (g.isCheckmate()) {
          const winner: Color = g.turn() === 'w' ? 'black' : 'white';
          res = { result: winner, reason: 'checkmate' };
        } else if (g.isStalemate()) {
          res = { result: 'draw', reason: 'stalemate' };
        } else if (g.isThreefoldRepetition()) {
          res = { result: 'draw', reason: 'threefold' };
        } else {
          res = { result: 'draw', reason: 'insufficient' };
        }
        emit('game-over', { roomId: gameState.roomId, ...res });
        setResult(res);
      }
      return true;
    } catch {
      return false;
    }
  }, [isMyTurn, result, timers, moveHistory, emit, gameState.roomId, gameState.playerColor, highlightLastMove]);

  const handleResign = () => {
    if (result) return;
    if (!window.confirm('Are you sure you want to resign?')) return;
    emit('resign', { roomId: gameState.roomId });
    const winner: Color = gameState.playerColor === 'white' ? 'black' : 'white';
    setResult({ result: winner, reason: 'resignation' });
  };

  const handleDrawOffer = () => {
    emit('offer-draw', { roomId: gameState.roomId });
  };

  const handleAcceptDraw = () => {
    emit('accept-draw', { roomId: gameState.roomId });
    setResult({ result: 'draw', reason: 'agreement' });
    setDrawOffered(false);
  };

  const handleDeclineDraw = () => {
    emit('decline-draw', { roomId: gameState.roomId });
    setDrawOffered(false);
  };

  const handleChat = (text: string) => {
    emit('chat-message', { roomId: gameState.roomId, message: text });
  };

  const getResultText = () => {
    if (!result) return '';
    if (result.result === 'draw') return '½ - ½  Draw';
    const winner = result.result === gameState.playerColor ? 'You win!' : 'You lose';
    const reasonMap: Record<string, string> = {
      checkmate: 'by checkmate',
      resignation: 'by resignation',
      timeout: 'on time',
      disconnection: 'by disconnection',
      agreement: 'by agreement',
      stalemate: 'by stalemate',
      threefold: 'by repetition',
      insufficient: 'insufficient material',
    };
    return `${winner} · ${reasonMap[result.reason] || result.reason}`;
  };

  const opponentColor: Color = gameState.playerColor === 'white' ? 'black' : 'white';
  const myCaptured = getCapturedPieces(fen, gameState.playerColor);
  const opponentCaptured = getCapturedPieces(fen, opponentColor);

  return (
    <div className="game-layout">
      {/* Left: Board area */}
      <div className="board-area">
        {/* Opponent info */}
        <PlayerCard
          name={gameState.opponentName}
          color={opponentColor}
          timeMs={timers[opponentColor]}
          isActive={activeColor === opponentColor && !result}
          capturedPieces={opponentCaptured}
          isYou={false}
        />

        {/* Board */}
        <div className="board-wrapper">
          {result && (
            <div className="result-overlay">
              <div className="result-box">
                <div className="result-text">{getResultText()}</div>
                <button className="btn-primary" onClick={onLeave}>New Game</button>
              </div>
            </div>
          )}
          <Chessboard
            id="main-board"
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={gameState.playerColor}
            customDarkSquareStyle={{ backgroundColor: '#769656' }}
            customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
            customSquareStyles={customSquares}
            areArrowsAllowed={true}
            animationDuration={150}
          />
        </div>

        {/* Player info */}
        <PlayerCard
          name={gameState.playerName}
          color={gameState.playerColor}
          timeMs={timers[gameState.playerColor]}
          isActive={activeColor === gameState.playerColor && !result}
          capturedPieces={myCaptured}
          isYou={true}
        />

        {/* Game controls */}
        {!result && (
          <div className="game-controls">
            <button className="ctrl-action resign" onClick={handleResign}>Resign</button>
            <button className="ctrl-action draw" onClick={handleDrawOffer}>Offer Draw</button>
          </div>
        )}

        {/* Draw offer banner */}
        {drawOffered && (
          <div className="draw-banner">
            <span>Opponent offers a draw</span>
            <button className="btn-accept" onClick={handleAcceptDraw}>Accept</button>
            <button className="btn-decline" onClick={handleDeclineDraw}>Decline</button>
          </div>
        )}
      </div>

      {/* Right: Video + moves + chat */}
      <div className="side-panel">
        <div className="side-header">
          <span className="room-badge">Room: {gameState.roomId}</span>
        </div>

        <VideoPanel
          localStream={webrtc.localStream}
          remoteStream={webrtc.remoteStream}
          audioEnabled={webrtc.audioEnabled}
          videoEnabled={webrtc.videoEnabled}
          opponentAudio={webrtc.opponentAudio}
          opponentVideo={webrtc.opponentVideo}
          isConnected={webrtc.isConnected}
          callError={webrtc.callError}
          onToggleAudio={webrtc.toggleAudio}
          onToggleVideo={webrtc.toggleVideo}
          onStartCall={webrtc.startCall}
          playerName={gameState.playerName}
          opponentName={gameState.opponentName}
        />

        <MoveList moves={moveHistory} />
        <Chat messages={messages} onSend={handleChat} myColor={gameState.playerColor} />

        <button className="leave-btn" onClick={onLeave}>← Leave Game</button>
      </div>
    </div>
  );
}
