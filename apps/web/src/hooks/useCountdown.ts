import { useEffect, useState } from 'react';

/** Whole seconds left of a server decision timer, or null when there is no timer (local play). */
export function useCountdown(timeLeftMs: number | null, version: number): number | null {
  const [left, setLeft] = useState<number | null>(
    timeLeftMs === null ? null : Math.ceil(timeLeftMs / 1000),
  );
  useEffect(() => {
    if (timeLeftMs === null) {
      setLeft(null);
      return;
    }
    const deadline = Date.now() + timeLeftMs;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [timeLeftMs, version]);
  return left;
}
