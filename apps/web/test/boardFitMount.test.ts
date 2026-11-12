import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeBoardArea } from '../src/hooks/useBoardFit';

afterEach(() => vi.unstubAllGlobals());

describe('board area attachment', () => {
  it('measures on mount, follows resize, and disconnects on unmount', () => {
    let resize: ResizeObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', Observer);

    const dimensions = { clientWidth: 1200, clientHeight: 700 };
    const element = dimensions as unknown as HTMLDivElement;
    const measured: { w: number; h: number }[] = [];
    const stop = observeBoardArea(element, (size) => measured.push(size));
    expect(measured).toEqual([{ w: 1200, h: 700 }]);
    expect(observe).toHaveBeenCalledWith(element);

    dimensions.clientWidth = 390;
    dimensions.clientHeight = 390;
    resize!([], {} as ResizeObserver);
    expect(measured.at(-1)).toEqual({ w: 390, h: 390 });

    stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
