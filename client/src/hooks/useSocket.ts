import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// In dev, Vite proxies /socket.io → localhost:3001 so '/' works.
// In production on Netlify, set VITE_SERVER_URL to your Render backend URL.
const SOCKET_URL = import.meta.env.VITE_SERVER_URL || '/';

let sharedSocket: Socket | null = null;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sharedSocket || !sharedSocket.connected) {
      sharedSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    }
    socketRef.current = sharedSocket;

    return () => {
      // Don't disconnect on unmount — socket is shared
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  const off = useCallback((event: string, handler?: (...args: unknown[]) => void) => {
    socketRef.current?.off(event, handler);
  }, []);

  return { socket: socketRef, emit, on, off };
}
