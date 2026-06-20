export type Color = 'white' | 'black';
export type GameStatus = 'idle' | 'waiting' | 'playing' | 'ended';

export interface Player {
  id: string;
  color: Color;
  name: string;
}

export interface Timers {
  white: number;
  black: number;
}

export interface GameState {
  roomId: string;
  playerColor: Color;
  opponentName: string;
  playerName: string;
  fen: string;
  timers: Timers;
  timeControl: number;
  players: Player[];
}

export interface ChatMessage {
  id: string;
  text: string;
  playerName: string;
  color: Color;
  senderId: string;
  timestamp: number;
}

export interface GameResult {
  result: Color | 'draw';
  reason:
    | 'checkmate'
    | 'resignation'
    | 'timeout'
    | 'disconnection'
    | 'agreement'
    | 'stalemate'
    | 'threefold'
    | 'insufficient';
}

export interface MediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
}
