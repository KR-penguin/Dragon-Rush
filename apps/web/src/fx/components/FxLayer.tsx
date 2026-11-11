import type { ReactNode } from 'react';
import type { GameStore } from '../../store/gameStore';
import { useFxEvents } from '../hooks/useFxEvents';
import { useButtonJuice, useFxSurface, useShakeTarget } from '../hooks/useFxRuntime';
import type { FxResolver } from '../types';
import '../fx.css';

interface FxLayerProps {
  /** When given, effects follow the store's animation queue. */
  readonly store?: GameStore;
  /** Turns symbolic anchors (seat, tile, HUD) into screen points for the current board. */
  readonly resolver?: FxResolver;
  /** Press juice on every button (default on). */
  readonly buttonJuice?: boolean;
}

/** Full-screen effect overlay (pointer-events: none). Mount once per screen. */
export function FxLayer({ store, resolver, buttonJuice = true }: FxLayerProps) {
  const s = useFxSurface();
  useFxEvents(store, resolver);
  return (
    <>
      <div className="fx-layer" aria-hidden="true">
        <canvas ref={s.canvas} className="fx-canvas" />
        <div ref={s.vignette} className="fx-vignette" />
        <div ref={s.texts} className="fx-texts" />
        <div ref={s.flash} className="fx-flash" />
      </div>
      <div ref={s.caption} className="fx-caption" role="status" aria-live="polite" />
      {buttonJuice && <ButtonJuice />}
    </>
  );
}

function ButtonJuice() {
  useButtonJuice();
  return null;
}

/** `.world-shake` wrapper: the trauma camera moves it; keep the HUD outside. */
export function ShakeContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useShakeTarget<HTMLDivElement>();
  return (
    <div ref={ref} className={className ? `world-shake ${className}` : 'world-shake'}>
      {children}
    </div>
  );
}
