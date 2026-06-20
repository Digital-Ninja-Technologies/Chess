import { useState, useRef, useCallback, useEffect } from 'react';
import { Color, Timers } from '../types';

interface UseTimerOptions {
  initialTimers: Timers;
  activeColor: Color;
  running: boolean;
  onTimeout: (color: Color) => void;
}

export function useTimer({ initialTimers, activeColor, running, onTimeout }: UseTimerOptions) {
  const [timers, setTimers] = useState<Timers>(initialTimers);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeColorRef = useRef(activeColor);
  const runningRef = useRef(running);

  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    setTimers(initialTimers);
  }, [initialTimers.white, initialTimers.black]); // eslint-disable-line

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const color = activeColorRef.current;
      setTimers((prev) => {
        const next = { ...prev, [color]: prev[color] - 100 };
        if (next[color] <= 0) {
          next[color] = 0;
          onTimeout(color);
        }
        return next;
      });
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, onTimeout]);

  const syncTimers = useCallback((newTimers: Timers) => {
    setTimers(newTimers);
  }, []);

  return { timers, syncTimers };
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
