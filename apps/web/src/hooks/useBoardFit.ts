import { useEffect, useMemo, useState, type RefObject } from 'react';
import { fitStage, projectedBounds, type StageFit } from '../types/boardGeometry';

/** Fits the tilted board's projected bounds into the measured play area. */
export function useBoardFit(areaRef: RefObject<HTMLElement | null>, tiltDeg: number): StageFit {
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [areaRef]);
  const bounds = useMemo(() => projectedBounds({ tiltDeg }), [tiltDeg]);
  return useMemo(() => fitStage(area, bounds), [area, bounds]);
}
