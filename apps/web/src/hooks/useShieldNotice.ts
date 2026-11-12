import type { GameEvent, SeatId } from '@dragon-rush/engine';
import { useEffect, useState } from 'react';
import type { GameStore } from '../store/gameStore';

export interface ShieldNoticeView {
  readonly key: number;
  readonly seat: SeatId;
  readonly name: string;
}

export const SHIELD_NOTICE_MS = 2400;

export function shieldNoticeFor(
  event: GameEvent | null,
  seats: readonly { readonly seat: SeatId; readonly name: string }[],
): Omit<ShieldNoticeView, 'key'> | null {
  if (event?.type !== 'ShieldUsed') return null;
  return {
    seat: event.seat,
    name: seats.find((seat) => seat.seat === event.seat)?.name ?? `P${event.seat + 1}`,
  };
}

/** Keeps the shield announcement visible even when the event queue immediately advances. */
export function useShieldNotice(store: GameStore): ShieldNoticeView | null {
  const [notice, setNotice] = useState<ShieldNoticeView | null>(null);
  useEffect(() => {
    let key = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.current === previous.current) return;
      const next = shieldNoticeFor(state.current, state.latest?.seats ?? []);
      if (!next) return;
      const view = { ...next, key: ++key };
      setNotice(view);
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => setNotice((current) => (current?.key === view.key ? null : current)),
        SHIELD_NOTICE_MS,
      );
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);
  return notice;
}
