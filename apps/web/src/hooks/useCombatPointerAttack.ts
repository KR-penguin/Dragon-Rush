import { useEffect, type RefObject } from 'react';
import type { KeyTracker } from '../services/fight/keyboardInput';

/** Keeps arena pointer input scoped to a live, unpaused local fight. */
export function useCombatPointerAttack(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  tracker: KeyTracker | null,
  enabled: boolean,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !tracker || !canvas) return;
    return tracker.attachPointer(canvas);
  }, [canvasRef, tracker, enabled]);
}
