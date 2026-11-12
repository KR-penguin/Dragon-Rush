import { useCallback, useMemo, useRef, useState, type RefCallback } from 'react';
import { fitStage, projectedBounds, type StageFit } from '../types/boardGeometry';

interface AreaSize {
  readonly w: number;
  readonly h: number;
}

/** Start measuring when the board element appears after the loading screen. */
export function observeBoardArea(element: HTMLElement, onMeasure: (size: AreaSize) => void) {
  const measure = () => onMeasure({ w: element.clientWidth, h: element.clientHeight });
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return () => observer.disconnect();
}

/** Fits the tilted board's projected bounds into the measured play area. */
export function useBoardFit(tiltDeg: number): {
  readonly fit: StageFit;
  readonly areaRef: RefCallback<HTMLDivElement>;
} {
  const [area, setArea] = useState<AreaSize>({ w: 0, h: 0 });
  const stop = useRef<(() => void) | null>(null);
  const areaRef = useCallback((element: HTMLDivElement | null) => {
    stop.current?.();
    stop.current = element ? observeBoardArea(element, setArea) : null;
  }, []);
  const bounds = useMemo(() => projectedBounds({ tiltDeg }), [tiltDeg]);
  const fit = useMemo(
    () => (area.w > 0 && area.h > 0 ? fitStage(area, bounds) : { scale: 0, x: 0, y: 0 }),
    [area, bounds],
  );
  return { fit, areaRef };
}
