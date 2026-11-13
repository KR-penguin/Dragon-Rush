import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeSpotlight } from '../src/services/spotlight';
import { animateCameraPose, resetCameraPose } from '../src/services/cameraMotion';
import { poseTransform, REST_POSE } from '../src/types/camera';

afterEach(() => vi.unstubAllGlobals());

function surface() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const request = vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('window', new EventTarget());
  let changed = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: () => void) {
        changed = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const animation = { playState: 'finished', pending: false };
  const cameraAnimation = { playState: 'finished', pending: false };
  let transform = '';
  const camera = Object.assign(new EventTarget(), {
    getAnimations: () => [cameraAnimation],
    animate: vi.fn(() => {
      cameraAnimation.playState = 'running';
      return cameraAnimation;
    }),
    style: {
      get transform() {
        return transform;
      },
      set transform(value: string) {
        transform = value;
        changed();
      },
      removeProperty() {
        transform = '';
        changed();
      },
    },
  });
  vi.stubGlobal('getComputedStyle', () => ({ transform: transform || 'none' }));
  const rect = vi.fn(() => ({ left: 10, top: 20, width: 80, height: 100 }));
  const pawn = Object.assign(new EventTarget(), {
    getBoundingClientRect: rect,
    getAnimations: () => [animation],
    closest: (selector: string) => (selector === '.camera' ? camera : null),
  }) as unknown as HTMLElement;
  const style = { setProperty: vi.fn() };
  const overlay = { style } as unknown as HTMLElement;
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  return {
    pawn,
    overlay,
    frames,
    request,
    rect,
    style,
    animation,
    camera: camera as unknown as HTMLElement,
    cameraAnimation,
    changed: () => changed(),
    flush,
    disconnect,
  };
}

describe('spotlight tracking', () => {
  it('measures a stationary pawn once instead of polling every idle frame', () => {
    const s = surface();
    const stop = observeSpotlight(s.overlay, s.pawn);
    expect(s.rect).toHaveBeenCalledTimes(1);
    expect(s.style.setProperty).toHaveBeenCalledWith('--px', '50px');
    expect(s.style.setProperty).toHaveBeenCalledWith('--py', '60px');
    expect(s.frames.size).toBe(0);
    stop();
  });

  it('follows a moving pawn and sleeps again when its animation ends', () => {
    const s = surface();
    s.animation.playState = 'running';
    const stop = observeSpotlight(s.overlay, s.pawn);
    expect(s.frames.size).toBe(1);
    s.flush();
    expect(s.rect).toHaveBeenCalledTimes(2);
    expect(s.frames.size).toBe(1);
    s.animation.playState = 'finished';
    s.flush();
    expect(s.frames.size).toBe(0);
    s.changed();
    expect(s.frames.size).toBe(1);
    s.flush();
    expect(s.frames.size).toBe(0);
    stop();
    expect(s.disconnect).toHaveBeenCalledOnce();
    s.changed();
    expect(s.frames.size).toBe(0);
  });

  it('wakes for a camera-only WAAPI beat and its delayed return after the tracker has gone idle', () => {
    const s = surface();
    const stop = observeSpotlight(s.overlay, s.pawn);
    expect(s.frames.size).toBe(0);
    const pose = { x: 40, y: 10, zoom: 1.06 };
    animateCameraPose(s.camera, { pose, ms: 250, easing: 'linear' }, 1, REST_POSE);
    expect(s.camera.style.transform).toBe(poseTransform(pose));
    expect(s.frames.size).toBe(1);
    s.rect.mockReturnValue({ left: 50, top: 30, width: 80, height: 100 });
    s.flush();
    expect(s.style.setProperty).toHaveBeenCalledWith('--px', '90px');
    s.cameraAnimation.playState = 'finished';
    s.flush();
    expect(s.frames.size).toBe(0);
    animateCameraPose(s.camera, { pose: REST_POSE, ms: 600, easing: 'linear' }, 1, pose);
    expect(s.frames.size).toBe(1);
    s.cameraAnimation.playState = 'finished';
    s.rect.mockReturnValue({ left: 10, top: 20, width: 80, height: 100 });
    s.flush();
    expect(s.style.setProperty).toHaveBeenLastCalledWith('--py', '60px');
    expect(s.frames.size).toBe(0);
    resetCameraPose(s.camera);
    expect(s.camera.style.transform).toBe('');
    s.flush();
    expect(s.frames.size).toBe(0);
    stop();
  });

  it('wakes for tracked CSS motion events and removes those listeners on cleanup', () => {
    const s = surface();
    const listen = vi.spyOn(s.camera, 'addEventListener');
    const stop = observeSpotlight(s.overlay, s.pawn);
    const listener = listen.mock.calls.find(([type]) => type === 'animationstart')?.[1];
    if (typeof listener !== 'function') throw new Error('missing animation listener');
    listener.call(s.camera, { target: new EventTarget() } as unknown as Event);
    expect(s.frames.size).toBe(0);
    s.cameraAnimation.playState = 'running';
    s.camera.dispatchEvent(new Event('transitionrun'));
    expect(s.frames.size).toBe(1);
    s.flush();
    s.cameraAnimation.playState = 'finished';
    s.camera.dispatchEvent(new Event('transitionend'));
    s.flush();
    expect(s.frames.size).toBe(0);
    s.camera.dispatchEvent(new Event('animationstart'));
    expect(s.frames.size).toBe(1);
    s.flush();
    stop();
    s.camera.dispatchEvent(new Event('transitionrun'));
    expect(s.frames.size).toBe(0);
  });
});
