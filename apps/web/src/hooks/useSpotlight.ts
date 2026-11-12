import type { SeatId } from '@dragon-rush/engine';
import { useEffect, useRef } from 'react';
import { getFxAnchor } from '../services/fxAnchors';

/**
 * Keeps the screen-space spotlight centred on a pawn by writing `--px`/`--py` on the overlay each
 * frame (no React renders); the pawn moves with hops and camera beats.
 */
export function useSpotlight(seat: SeatId | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (seat === null || !el || typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    let lastX = -1;
    let lastY = -1;
    const tick = () => {
      const a = getFxAnchor({ kind: 'pawn', id: seat });
      if (a) {
        // Aim at the pawn's chest, a little above the centre of its standee box.
        const x = Math.round(a.x);
        const y = Math.round(a.y - a.height * 0.1);
        if (x !== lastX || y !== lastY) {
          el.style.setProperty('--px', `${x}px`);
          el.style.setProperty('--py', `${y}px`);
          lastX = x;
          lastY = y;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [seat]);
  return ref;
}
