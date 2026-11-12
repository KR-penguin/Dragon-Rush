/**
 * Button press juice via one delegated listener (no component edits): down = scale 0.95 + 2 px in
 * 70 ms, release = back-out over 180 ms, click sound ±1 semitone. Composited additively so a
 * button's own transform (hover lift) is kept.
 */
export interface ButtonJuiceOptions {
  readonly selector?: string;
  readonly reduceMotion?: () => boolean;
  readonly onPress?: (semitones: number) => void;
  readonly random?: () => number;
}

const PRESSED = 'translateY(2px) scale(0.95)';
const REST = 'translateY(0) scale(1)';

export function installButtonJuice(
  root: Document | HTMLElement,
  o: ButtonJuiceOptions = {},
): () => void {
  const selector = o.selector ?? 'button:not(:disabled), [role="button"]';
  const random = o.random ?? Math.random;
  const pressed = new Map<Element, Animation>();

  const down = (ev: Event) => {
    const el = (ev.target as Element | null)?.closest?.(selector);
    if (!el || typeof (el as HTMLElement).animate !== 'function') return;
    o.onPress?.(Math.round(random() * 2 - 1));
    if (o.reduceMotion?.()) return;
    pressed.get(el)?.cancel();
    try {
      pressed.set(
        el,
        (el as HTMLElement).animate([{ transform: REST }, { transform: PRESSED }], {
          duration: 70,
          easing: 'ease-out',
          fill: 'forwards',
          composite: 'add',
        }),
      );
    } catch {
      // No additive WAAPI: skip the visual press.
    }
  };

  const up = () => {
    for (const [el, anim] of pressed) {
      anim.cancel();
      try {
        (el as HTMLElement).animate([{ transform: PRESSED }, { transform: REST }], {
          duration: 180,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          composite: 'add',
        });
      } catch {
        // See above.
      }
    }
    pressed.clear();
  };

  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointerup', up, true);
  root.addEventListener('pointercancel', up, true);
  return () => {
    root.removeEventListener('pointerdown', down, true);
    root.removeEventListener('pointerup', up, true);
    root.removeEventListener('pointercancel', up, true);
    up();
  };
}
