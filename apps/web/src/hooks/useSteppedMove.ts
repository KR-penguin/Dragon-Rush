import { BOARD_SIZE, type GameEvent, type SeatId } from '@dragon-rush/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { stepPath } from '../types/boardLayout';
import { hopSchedule, teleportHopSchedule } from '../types/motion';

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

/** Walks either move through each forward tile; reduced motion shows the destination at once. */
export function useSteppedMove(
  current: GameEvent | null,
  speed: number,
  reduced: boolean,
  onStep?: () => void,
): SteppedMove | null {
  const [move, setMove] = useState<SteppedMove | null>(null);
  // Refs so a speed change or a new callback does not restart a walk in progress.
  const latest = useRef({ speed, onStep });
  useEffect(() => {
    latest.current = { speed, onStep };
  });

  useLayoutEffect(() => {
    if (!current || current.type !== 'Moved' || current.steps < 1 || reduced) {
      setMove(null);
      return;
    }
    const path = stepPath(current.from, current.steps, BOARD_SIZE);
    const schedule = (
      current.via === 'teleport' ? teleportHopSchedule(current.steps) : hopSchedule(current.steps)
    ).map((ms) => ms / latest.current.speed);
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
  }, [current, reduced]);

  return move;
}
