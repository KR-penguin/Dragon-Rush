import type { SeatId } from '@dragon-rush/engine';
import { useSpotlight } from '../../hooks/useSpotlight';

interface SpotlightProps {
  seat: SeatId | null;
  /** Targeting dims the whole world instead (gold rims mark the targets). */
  mode: 'off' | 'turn' | 'targeting';
}

/** Screen-space dimming overlay; never a filter on the 3D board (that would flatten it). */
export function Spotlight({ seat, mode }: SpotlightProps) {
  const ref = useSpotlight(mode === 'turn' ? seat : null);
  return <div ref={ref} className={`spotlight spotlight-${mode}`} aria-hidden="true" />;
}
