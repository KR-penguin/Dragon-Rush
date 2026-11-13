import type { SeatId } from '@dragon-rush/engine';
import { useEffect, useRef } from 'react';
import { observeSpotlight } from '../services/spotlight';

/**
 * Follow hops and camera transforms, then stop measuring while the board is still.
 */
export function useSpotlight(seat: SeatId | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (seat === null || !el || typeof requestAnimationFrame === 'undefined') return;
    const pawn = document.querySelector<HTMLElement>(`[data-fx-anchor="pawn:${seat}"]`);
    return pawn ? observeSpotlight(el, pawn) : undefined;
  }, [seat]);
  return ref;
}
