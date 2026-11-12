import { useLayoutEffect, useRef } from 'react';
import { countUpMs } from '../types/eventCards';

/**
 * Rolls a counter to a new value (300 ms for changes up to 10, else 500 ms) by writing the
 * element's text in rAF, so React does not re-render every frame.
 */
export function useCountUp<T extends HTMLElement>(value: number, reduced: boolean) {
  const ref = useRef<T>(null);
  const shown = useRef(value);
  useLayoutEffect(() => {
    const el = ref.current;
    const from = shown.current;
    if (!el) return;
    if (from === value) {
      el.textContent = String(value);
      return;
    }
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      shown.current = value;
      el.textContent = String(value);
      return;
    }
    const ms = countUpMs(value - from);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      shown.current = v;
      el.textContent = String(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      // An interrupted roll lands on the target so the next one starts from a real value.
      shown.current = value;
      el.textContent = String(value);
    };
  }, [value, reduced]);
  return ref;
}
