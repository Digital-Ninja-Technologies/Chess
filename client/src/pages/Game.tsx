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
    for (let i = 0; i < count - remaining; i++) captured.push(piece);
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

  // Click-to-move state
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [promotionSquare, setPromotionSquare] = useState<Square | null>(null);
  const pendingPromoFrom = useRef<Square | null>(null);

  const chessRef = useRef(chess);
  chessRef.current = chess;

  const isMyTurn = activeColor === gameState.playerColor;
  const isWhite = gameState.playerColor === 'white';
  const myColorChar = isWhite ? 'w' : 'b';

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

  const highlightLastMove = useCallback((g: Chess) => {
    const history = g.history({ verbose: true });
    const last = history[history.length - 1];
    if (!last) { setLastMoveSquares({}); return; }
    setLastMoveSquares({
      [last.from]: { backgroundColor: 'rgba(255, 255, 100, 0.35)' },
      [last.to]: { backgroundColor: 'rgba(255, 255, 100, 0.35)' },
    });
  }, []);

  const getCheckSquare = useCallback((g: Chess): Record<string, React.CSSProperties> => {
    if (!g.inCheck()) return {};
    const board = g.board();
    const kingColor = g.turn();
    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type === 'k' && sq.color === kingColor) {
          return { [sq.square]: { backgroundColor: 'rgba(220, 50, 50, 0.6)' } };
        }
      }
    }
    return {};
  }, []);

  // Merge all square styles
  const allSquareStyles = {
    ...lastMoveSquares,
    ...getCheckSquare(chess),
    ...optionSquares,
  };

  const getMoveOptions = useCallback((square: Square): boolean => {
    const g = chessRef.current;
    const moves = g.moves({ square, verbose: true });
    if (!moves.length) return false;

    const styles: Record<string, React.CSSProperties> = {
      [square]: { backgroundColor: 'rgba(129, 182, 76, 0.5)' },
    };
    moves.forEach(m => {
      const hasPiece = g.get(m.to as Square);
      styles[m.to] = hasPiece
        ? {
            background: 'radial-gradient(transparent 58%, rgba(129,182,76,0.65) 58%)',
            borderRadius: '50%',
            zIndex: 1,
          }
        : {
            background: 'radial-gradient(rgba(129,182,76,0.55) 28%, transparent 28%)',
            borderRadius: '50%',
          };
    });
    setOptionSquares(styles);
    return true;
  }, []);

  const commitMove = useCallback((from: Square, to: Square, promotion?: string) => {
    const g = chessRef.current;
    try {
      const move = g.move({ from, to, promotion: promotion || undefined });
      if (!move) return false;

      const newFen = g.fen();
      setFen(newFen);
      setActiveColor(g.turn() === 'w' ? 'white' : 'black');
      highlightLastMove(g);
      setOptionSquares({});
      setSelectedSquare(null);

      setMoveHistory(prev => {
        const next = [...prev, move.san];
        return next;
      });

      emit('move', { roomId: gameState.roomId, move: move.san, fen: newFen, timers });

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
  }, [emit, gameState.roomId, timers, highlightLastMove]);

  const onSquareClick = useCallback((square: Square) => {
    if (!isMyTurn || result) return;

    const g = chessRef.current;
    const clickedPiece = g.get(square);

    // No piece selected yet
    if (!selectedSquare) {
      if (!clickedPiece || clickedPiece.color !== myColorChar) return;
      if (getMoveOptions(square)) setSelectedSquare(square);
      return;
    }

    // Clicking the same square → deselect
    if (square === selectedSquare) {
      setSelectedSquare(null);
      setOptionSquares({});
      return;
    }

    // Clicking another own piece → switch selection
    if (clickedPiece && clickedPiece.color === myColorChar) {
      if (getMoveOptions(square)) setSelectedSquare(square);
      else { setSelectedSquare(null); setOptionSquares({}); }
      return;
    }

    // Attempt move from selectedSquare → square
    const movingPiece = g.get(selectedSquare);
    const isPromotion =
      movingPiece?.type === 'p' &&
      ((gameState.playerColor === 'white' && square[1] === '8') ||
       (gameState.playerColor === 'black' && square[1] === '1'));

    // Verify the target is a legal move before committing/showing promotion
    const legalTargets = g.moves({ square: selectedSquare, verbose: true }).map(m => m.to);
    if (!legalTargets.includes(square)) {
      setSelectedSquare(null);
      setOptionSquares({});
      return;
    }

    if (isPromotion) {
      pendingPromoFrom.current = selectedSquare;
      setPromotionSquare(square);
      return;
    }

    commitMove(selectedSquare, square);
  }, [isMyTurn, result, selectedSquare, myColorChar, getMoveOptions, gameState.playerColor, commitMove]);

  const onPromotionPieceSelect = useCallback((piece?: string): boolean => {
    if (!piece || !promotionSquare || !pendingPromoFrom.current) {
      setPromotionSquare(null);
      setSelectedSquare(null);
      setOptionSquares({});
      pendingPromoFrom.current = null;
      return false;
    }
    // piece comes as e.g. 'wQ', 'bR' — extract the type letter, lowercase
    const promo = piece[1].toLowerCase();
    const ok = commitMove(pendingPromoFrom.current, promotionSquare, promo);
    setPromotionSquare(null);
    pendingPromoFrom.current = null;
    return ok;
  }, [promotionSquare, commitMove]);

  // Socket event listeners
  useEffect(() => {
    const cleanupMove = on('opponent-move', ((data: { move: string; fen: string; timers: GameState['timers'] }) => {
      const g = chessRef.current;
      try {
        g.move(data.move);
        setFen(g.fen());
        setActiveColor(g.turn() === 'w' ? 'white' : 'black');
        syncTimers(data.timers);
        highlightLastMove(g);
        setMoveHistory(prev => [...prev, data.move]);
      } catch (e) {
        console.error('Invalid opponent move:', data.move, e);
      }
    }) as (...args: unknown[]) => void);

    const cleanupEnd = on('game-ended', ((data: GameResult) => {
      setResult(data);
    }) as (...args: unknown[]) => void);

    const cleanupDrawOffer = on('draw-offered', (() => setDrawOffered(true)) as (...args: unknown[]) => void);
    const cleanupDrawDecline = on('draw-declined', (() => setDrawOffered(false)) as (...args: unknown[]) => void);
    const cleanupChat = on('chat-message', ((msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    }) as (...args: unknown[]) => void);

    return () => {
      cleanupMove(); cleanupEnd(); cleanupDrawOffer(); cleanupDrawDecline(); cleanupChat();
    };
  }, [on, syncTimers, highlightLastMove]);

  useEffect(() => {
    const cleanup = on('opponent-joined', (() => webrtc.startCall()) as (...args: unknown[]) => void);
    if (gameState.playerColor === 'black') webrtc.startCall();
    return cleanup;
  }, []); // eslint-disable-line

  const handleResign = () => {
    if (result) return;
    if (!window.confirm('Are you sure you want to resign?')) return;
    emit('resign', { roomId: gameState.roomId });
    const winner: Color = gameState.playerColor === 'white' ? 'black' : 'white';
    setResult({ result: winner, reason: 'resignation' });
  };

  const getResultText = () => {
    if (!result) return '';
    if (result.result === 'draw') return '½ - ½  Draw';
    const winner = result.result === gameState.playerColor ? 'You win!' : 'You lose';
    const reasons: Record<string, string> = {
      checkmate: 'by checkmate', resignation: 'by resignation', timeout: 'on time',
      disconnection: 'by disconnection', agreement: 'by agreement',
      stalemate: 'by stalemate', threefold: 'by repetition', insufficient: 'insufficient material',
    };
    return `${winner} · ${reasons[result.reason] || result.reason}`;
  };

  const opponentColor: Color = gameState.playerColor === 'white' ? 'black' : 'white';

  return (
    <div className="game-layout">
      <div className="board-area">
        <PlayerCard
          name={gameState.opponentName}
          color={opponentColor}
          timeMs={timers[opponentColor]}
          isActive={activeColor === opponentColor && !result}
          capturedPieces={getCapturedPieces(fen, opponentColor)}
          isYou={false}
        />

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
            boardOrientation={gameState.playerColor}
            onSquareClick={onSquareClick}
            onPromotionPieceSelect={onPromotionPieceSelect}
            promotionToSquare={promotionSquare}
            showPromotionDialog={!!promotionSquare}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: '#769656' }}
            customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
            customSquareStyles={allSquareStyles}
            animationDuration={150}
          />
        </div>

        <PlayerCard
          name={gameState.playerName}
          color={gameState.playerColor}
          timeMs={timers[gameState.playerColor]}
          isActive={activeColor === gameState.playerColor && !result}
          capturedPieces={getCapturedPieces(fen, gameState.playerColor)}
          isYou={true}
        />

        {!result && (
          <div className="game-controls">
            <button className="ctrl-action resign" onClick={handleResign}>Resign</button>
            <button className="ctrl-action draw" onClick={() => emit('offer-draw', { roomId: gameState.roomId })}>
              Offer Draw
            </button>
          </div>
        )}

        {drawOffered && (
          <div className="draw-banner">
            <span>Opponent offers a draw</span>
            <button className="btn-accept" onClick={() => {
              emit('accept-draw', { roomId: gameState.roomId });
              setResult({ result: 'draw', reason: 'agreement' });
              setDrawOffered(false);
            }}>Accept</button>
            <button className="btn-decline" onClick={() => {
              emit('decline-draw', { roomId: gameState.roomId });
              setDrawOffered(false);
            }}>Decline</button>
          </div>
        )}
      </div>

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
        <Chat messages={messages} onSend={(text) => emit('chat-message', { roomId: gameState.roomId, message: text })} myColor={gameState.playerColor} />
        <button className="leave-btn" onClick={onLeave}>← Leave Game</button>
      </div>
    </div>
  );
}
