import type { SeatId } from '@dragon-rush/engine';
import { useLayoutEffect, useRef } from 'react';
import { getFxAnchor } from '../../services/fxAnchors';
import { fxAnchorProps } from '../../types/fxAnchor';
import {
  clampThrow,
  cubeTransform,
  DICE_ROLL_MS,
  DIE_FACES,
  diceSpinKeyframes,
  diceThrowKeyframes,
  faceTransform,
  isDieFace,
  LOCAL_THROW,
  REST_ROTATION,
  type DieFace,
} from '../../types/motion';

const PIPS: Record<DieFace, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const rollIds = new WeakMap<object, number>();
let nextRollId = 0;
/** Stable number per roll object, used to restart the number pop animation. */
const rollId = (key: object): number => {
  let id = rollIds.get(key);
  if (id === undefined) {
    id = ++nextRollId;
    rollIds.set(key, id);
  }
  return id;
};

export interface DiceRoll {
  /** Changes for every roll (the DiceRolled event being shown). */
  readonly key: object;
  readonly value: number;
  readonly seat: SeatId;
  /** Rolled by a player at this screen: thrown from the tray's left, else from their corner card. */
  readonly local: boolean;
}

interface DiceTrayProps {
  /** Face to rest on (the last roll), or null before the first roll. */
  value: number | null;
  roll: DiceRoll | null;
  speed: number;
  reduced: boolean;
}

/** CSS-3D d6 in a felt tray; it always lands on the engine's value (decision sheet §1.7). */
export function DiceTray({ value, roll, speed, reduced }: DiceTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const rollKey = roll?.key ?? null;

  useLayoutEffect(() => {
    if (!roll || !isDieFace(roll.value)) return;
    const path = pathRef.current;
    const cube = cubeRef.current;
    const tray = trayRef.current;
    if (!path || !cube || !tray || typeof cube.animate !== 'function') return;
    const ms = DICE_ROLL_MS / speed;
    if (reduced) {
      path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
      return;
    }
    let from: { x: number; y: number } = LOCAL_THROW;
    if (!roll.local) {
      const card = getFxAnchor({ kind: 'seat', id: roll.seat });
      const r = tray.getBoundingClientRect();
      if (card) from = clampThrow({ x: card.x - (r.left + r.width / 2), y: card.y - (r.top + r.height / 2) });
    }
    path.animate(diceThrowKeyframes(from.x, from.y), { duration: ms });
    cube.animate(diceSpinKeyframes(roll.value), { duration: ms });
    tray.animate(
      [
        { transform: 'translate(0, 0)', offset: 0 },
        { transform: 'translate(0, 0)', offset: 0.855 },
        { transform: 'translate(-2px, 1px)', offset: 0.89 },
        { transform: 'translate(2px, -1px)', offset: 0.93 },
        { transform: 'translate(0, 0)', offset: 1 },
      ],
      { duration: ms },
    );
    // rollKey identifies the roll; the other values are read once per roll.
  }, [rollKey]);

  const face: DieFace = isDieFace(roll?.value ?? value) ? ((roll?.value ?? value) as DieFace) : 1;
  const shown = roll?.value ?? value;
  return (
    <div
      ref={trayRef}
      className={`dice-tray${shown === null ? ' is-idle' : ''}`}
      {...fxAnchorProps({ kind: 'dice' })}
      aria-label={shown === null ? '주사위' : `주사위 ${shown}`}
      role="img"
    >
      <div className="dice-felt">
        <div ref={pathRef} className="die-path">
          <div className="die-shadow" />
          <div ref={cubeRef} className="die-cube" style={{ transform: cubeTransform(REST_ROTATION[face]) }}>
            {DIE_FACES.map((f) => (
              <div
                key={f}
                className={`die-face die-face-${f}`}
                style={{ transform: faceTransform(f, 'calc(var(--die) / 2)') }}
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className={PIPS[f].includes(i) ? 'pip' : 'pip pip-off'} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {shown !== null && (
        <span
          key={rollKey ? `roll-${rollId(rollKey)}` : 'rest'}
          className={`dice-number${roll ? ' is-new' : ''}`}
          style={{ animationDelay: roll && !reduced ? `${600 / speed}ms` : '0ms' }}
        >
          {shown}
        </span>
      )}
    </div>
  );
}
