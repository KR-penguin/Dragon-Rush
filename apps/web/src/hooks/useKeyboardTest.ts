import { useEffect, useState } from 'react';
import { KeyTracker, gameKeysOf } from '../services/fight';
import { KEY_LAYOUTS } from '../types/combatControls';

/** Live set of pressed combat keys while `active` (the "키보드 테스트" lights). */
export function useKeyboardTest(active: boolean): ReadonlySet<string> {
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    const tracker = new KeyTracker(gameKeysOf(Object.values(KEY_LAYOUTS)));
    const detach = tracker.attach(window, document);
    const off = tracker.subscribe(() => setPressed(new Set(tracker.pressed())));
    return () => {
      off();
      detach();
      setPressed(new Set());
    };
  }, [active]);
  return pressed;
}
