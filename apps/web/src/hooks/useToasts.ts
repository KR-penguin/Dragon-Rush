import type { SeatId } from '@dragon-rush/engine';
import { useEffect, useState } from 'react';
import { describeEvent, eventIcon, eventSeat } from '../animation/eventTimeline';
import type { GameStore } from '../store/gameStore';
import type { IconName } from '../types/icons';

export interface Toast {
  readonly id: number;
  readonly icon: IconName;
  readonly text: string;
  readonly seat: SeatId | null;
  readonly overlay?: boolean;
}

const MAX_TOASTS = 3;
export const TOAST_MS = 6000;

/** The last few events as short toasts; the full log lives in the chronicle. */
export function useToasts(store: GameStore): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let id = 0;
    let active = true;
    let noticePending = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const enqueue = (toast: Toast) => {
      setToasts((ts) => {
        const next = [...ts, toast];
        return [
          ...next.filter((item) => !item.overlay).slice(-MAX_TOASTS),
          ...next.filter((item) => item.overlay).slice(-MAX_TOASTS),
        ];
      });
      const t = setTimeout(() => {
        timers.delete(t);
        setToasts((ts) => ts.filter((x) => x.id !== toast.id));
      }, TOAST_MS);
      timers.add(t);
    };
    const showNotices = () => {
      if (noticePending) return;
      noticePending = true;
      queueMicrotask(() => {
        noticePending = false;
        if (!active) return;
        for (const notice of store.getState().drainNotices())
          enqueue({ id: ++id, icon: 'bot', text: notice.text, seat: notice.seat, overlay: true });
      });
    };
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.notices.length) showNotices();
      const e = s.current;
      if (!e || e === prev.current || !s.display || !s.latest) return;
      const seats = s.latest.seats;
      const display = s.display;
      const text = describeEvent(
        e,
        (seat) => seats.find((x) => x.seat === seat)?.name ?? `P${seat + 1}`,
        (i) => display.rules.board[i]!.id,
      );
      if (!text || e.type === 'TurnEnded') return;
      const toast: Toast = { id: ++id, icon: eventIcon(e), text, seat: eventSeat(e) };
      enqueue(toast);
    });
    if (store.getState().notices.length) showNotices();
    return () => {
      active = false;
      unsubscribe();
      for (const t of timers) clearTimeout(t);
    };
  }, [store]);
  return toasts;
}
