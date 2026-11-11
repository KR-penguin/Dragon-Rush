import { BOARD_SIZE, type GameEvent, type SeatId } from '@hero-dice/engine';
import { useEffect, useRef, useState } from 'react';
import { eventDuration } from '../animation/eventTimeline';
import { stepPath } from '../types/boardLayout';

export interface TokenOverride {
  readonly seat: SeatId;
  readonly tile: number;
}

/** Walks a token tile by tile while a dice move is on screen. */
export function useSteppedMove(
  current: GameEvent | null,
  speed: number,
  onStep?: () => void,
): TokenOverride | null {
  const [override, setOverride] = useState<TokenOverride | null>(null);
  // Refs so a speed change or a new callback does not restart a walk in progress.
  const latest = useRef({ speed, onStep });
  useEffect(() => {
    latest.current = { speed, onStep };
  });

  useEffect(() => {
    if (!current || current.type !== 'Moved' || current.via !== 'dice' || current.steps < 1) {
      setOverride(null);
      return;
    }
    const path = stepPath(current.from, current.steps, BOARD_SIZE);
    const stepMs = eventDuration(current) / current.steps / latest.current.speed;
    const seat = current.seat;
    let i = 0;
    const show = () => {
      setOverride({ seat, tile: path[i]! });
      latest.current.onStep?.();
      i += 1;
    };
    show();
    const timer = setInterval(() => {
      if (i >= path.length) clearInterval(timer);
      else show();
    }, stepMs);
    return () => clearInterval(timer);
  }, [current]);

  return override;
}
