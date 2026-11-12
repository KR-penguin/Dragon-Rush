import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Point } from '../../types/boardGeometry';
import { fxAnchorProps } from '../../types/fxAnchor';
import { HOP_LIFT_KEYFRAMES, SHADOW_KEYFRAMES, squashKeyframes } from '../../types/motion';
import type { PawnViewModel } from '../../types/pawnView';
import { Crest } from '../icons/Crest';
import { JobArt } from '../icons/Art';

/** `out`: eliminated, the standee topples then fades. `motion`: how the next tile change animates
 * (null slides briefly for slot changes). `count`: rolled number counting down over the head. */
export type PawnView = PawnViewModel;

interface PawnProps {
  view: PawnView;
  spot: Point;
  reduced: boolean;
}

const at = (p: Point) => `translate3d(${p.x}px, ${p.y}px, 1px)`;

/** Painted cardboard standee on a seat-coloured base. Moves with transforms only (WAAPI hops). */
export function Pawn({ view, spot, reduced }: PawnProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hopRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const prev = useRef(spot);

  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = spot;
    const root = rootRef.current;
    if (!root || typeof root.animate !== 'function') return;
    if (from.x === spot.x && from.y === spot.y) return;
    const m = view.motion;
    if (reduced || m?.kind === 'blink') {
      // Cross-fade in place of a hop (reduced motion) or a teleport blink. Opacity only on the
      // standee art leaf: opacity on a preserve-3d ancestor would flatten the billboard.
      const ms = reduced ? 80 : (m?.ms ?? 300);
      artRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });
      return;
    }
    if (!m) {
      root.animate([{ transform: at(from) }, { transform: at(spot) }], { duration: 160, easing: 'ease-out' });
      return;
    }
    root.animate([{ transform: at(from) }, { transform: at(spot) }], {
      duration: m.ms,
      easing: 'ease-in-out',
    });
    hopRef.current?.animate(HOP_LIFT_KEYFRAMES, { duration: m.ms });
    figureRef.current?.animate(squashKeyframes(m.final), { duration: m.ms });
    shadowRef.current?.animate(SHADOW_KEYFRAMES, { duration: m.ms });
    // The tile under the landing presses down for 80 ms.
    const tileFace = document.querySelector<HTMLElement>(
      `[data-fx-anchor="tile:${view.tile}"] .tile-face`,
    );
    tileFace?.animate(
      [{ transform: 'translateZ(0px)' }, { transform: 'translateZ(-2px)' }, { transform: 'translateZ(0px)' }],
      { duration: 80, delay: m.ms * 0.85 },
    );
  }, [spot, reduced, view.tile, view.motion]);

  const className = [
    'pawn',
    view.active ? 'is-active' : '',
    view.out ? 'is-out' : '',
  ].join(' ');

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ transform: at(spot), '--seat-color': view.color } as CSSProperties}
      {...fxAnchorProps({ kind: 'pawn', id: view.seat })}
    >
      <div ref={shadowRef} className="pawn-shadow" />
      <div ref={hopRef} className="pawn-hop">
        <div className="pawn-base">
          <Crest shape={view.crest} className="pawn-base-crest" />
        </div>
        <div className="pawn-stand">
          <div ref={figureRef} className="pawn-figure">
            <div ref={artRef} className="pawn-card" title={view.name}>
              <JobArt job={view.job} className="pawn-art" />
              <Crest shape={view.crest} className="pawn-crest" />
            </div>
          </div>
          {view.count !== null && (
            <span
              key={view.count}
              className={`pawn-count${view.count === 0 ? ' is-burst' : ''}`}
              style={{ animationDelay: `${view.countDelayMs}ms` }}
            >
              {view.count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
