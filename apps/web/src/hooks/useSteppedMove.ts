import { BOARD_SIZE, type GameEvent, type SeatId } from '@dragon-rush/engine';
import { useEffect, useRef, useState } from 'react';
import { stepPath } from '../types/boardLayout';
import { hopSchedule } from '../types/motion';

export interface SteppedMove {
  readonly seat: SeatId;
  /** Tile the pawn is hopping onto. */
  readonly tile: number;
  /** 1-based index of the hop in progress. */
  readonly hop: number;
  readonly steps: number;
  /** Length of this hop at the current speed. */
  readonly ms: number;
}

/** Walks a token tile by tile while a dice move is on screen (160 ms first hop, x0.9 after). */
export function useSteppedMove(
  current: GameEvent | null,
  speed: number,
  onStep?: () => void,
): SteppedMove | null {
  const [move, setMove] = useState<SteppedMove | null>(null);
  // Refs so a speed change or a new callback does not restart a walk in progress.
  const latest = useRef({ speed, onStep });
  useEffect(() => {
    latest.current = { speed, onStep };
  });

  useEffect(() => {
    if (!current || current.type !== 'Moved' || current.via !== 'dice' || current.steps < 1) {
      setMove(null);
      return;
    }
    const path = stepPath(current.from, current.steps, BOARD_SIZE);
    const schedule = hopSchedule(current.steps).map((ms) => ms / latest.current.speed);
    const seat = current.seat;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = (i: number) => {
      const ms = schedule[i]!;
      setMove({ seat, tile: path[i]!, hop: i + 1, steps: path.length, ms });
      latest.current.onStep?.();
      if (i + 1 < path.length) timer = setTimeout(() => show(i + 1), ms);
    };
    show(0);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [current]);

  return move;
}
