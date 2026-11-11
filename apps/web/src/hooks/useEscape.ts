import { useEffect, useRef } from 'react';

/** Calls `onEscape` on the Escape key while `active`. */
export function useEscape(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
