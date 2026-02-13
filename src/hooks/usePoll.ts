import { useEffect, useRef } from 'react';

export function usePoll(fn: () => void, opts: { intervalMs: number; enabled?: boolean }) {
  const { intervalMs, enabled = true } = opts;
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timer.current = window.setInterval(fn as any, intervalMs);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [intervalMs, enabled]);
}

