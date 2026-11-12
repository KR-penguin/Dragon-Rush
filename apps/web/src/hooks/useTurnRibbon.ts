import type { SeatId } from '@dragon-rush/engine';
import { useEffect, useState } from 'react';
import type { GameStore } from '../store/gameStore';

export interface TurnRibbonView {
  readonly key: number;
  readonly seat: SeatId;
  readonly resting: boolean;
  /** Total time on screen (600 ms in, 400 ms hold, 300 ms out) at the current speed. */
  readonly ms: number;
}

/** "OO의 차례" ribbon at the start of a turn this screen plays (humans only). */
export function useTurnRibbon(store: GameStore): TurnRibbonView | null {
  const [ribbon, setRibbon] = useState<TurnRibbonView | null>(null);
  useEffect(() => {
    let key = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe((s, prev) => {
      const e = s.current;
      if (!e || e === prev.current || e.type !== 'TurnStarted') return;
      if (!s.latest?.controllableSeats.includes(e.seat)) return;
      const ms = 1300 / s.speed;
      const view = { key: ++key, seat: e.seat, resting: e.resting, ms };
      setRibbon(view);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRibbon((r) => (r?.key === view.key ? null : r)), ms);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);
  return ribbon;
}
