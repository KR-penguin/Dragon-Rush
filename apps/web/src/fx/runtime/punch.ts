import type { PunchKind } from '../types';

/**
 * WAAPI one-shots on DOM elements. Transform/opacity only, composited additively so an element's
 * own transform (e.g. a tile on a tilted 3D board) is kept.
 */
const BACK_OUT = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const PUNCHES: Record<PunchKind, { keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = {
  pop: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.1)', offset: 0.35 },
      { transform: 'scale(1)' },
    ],
    options: { duration: 180, easing: 'ease-out' },
  },
  glow: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.08)', offset: 0.45 },
      { transform: 'scale(1)' },
    ],
    options: { duration: 250, easing: BACK_OUT },
  },
  wobble: {
    keyframes: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(0)' },
    ],
    options: { duration: 200, easing: 'linear' },
  },
  press: {
    keyframes: [{ transform: 'scale(1.25, 0.8)' }, { transform: 'scale(1)' }],
    options: { duration: 140, easing: BACK_OUT },
  },
  darken: {
    keyframes: [{ opacity: 1 }, { opacity: 0.5, offset: 0.7 }, { opacity: 1 }],
    options: { duration: 420, easing: 'ease-in-out' },
  },
};

const running = new WeakMap<Element, Animation>();

export function punchElement(el: Element, kind: PunchKind): void {
  if (typeof (el as HTMLElement).animate !== 'function') return;
  running.get(el)?.cancel();
  const { keyframes, options } = PUNCHES[kind];
  try {
    const anim = (el as HTMLElement).animate(keyframes, {
      ...options,
      composite: kind === 'darken' ? 'replace' : 'add',
    });
    running.set(el, anim);
  } catch {
    // Old engines without composite support: skip the punch rather than break the frame.
  }
}
