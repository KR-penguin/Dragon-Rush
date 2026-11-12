import type { SeatId } from '@dragon-rush/engine';
import { useLayoutEffect, useRef } from 'react';
import { fxAnchorProps } from '../../types/fxAnchor';
import {
  isRouletteValue,
  ROULETTE_LAND_MS,
  ROULETTE_ROLL_MS,
  ROULETTE_VALUES,
  rouletteLabelPosition,
  rouletteRestAngle,
  rouletteSectorPath,
  rouletteSpinKeyframes,
} from '../../types/motion';

export interface DiceRoll {
  /** The DiceRolled event is the sole source of the outcome. */
  readonly key: object;
  readonly value: number;
  readonly seat: SeatId;
  readonly local: boolean;
}

interface DiceTrayProps {
  value: number | null;
  roll: DiceRoll | null;
  speed: number;
  reduced: boolean;
}

const rollIds = new WeakMap<object, number>();
let nextRollId = 0;
const rollId = (key: object): number => {
  let id = rollIds.get(key);
  if (id === undefined) {
    id = ++nextRollId;
    rollIds.set(key, id);
  }
  return id;
};

/** Ten-sector wheel. The fixed pointer reads the engine's DiceRolled value. */
export function DiceTray({ value, roll, speed, reduced }: DiceTrayProps) {
  const wheelRef = useRef<SVGSVGElement>(null);
  const previousAngle = useRef(0);
  const rollKey = roll?.key ?? null;
  const shown = roll?.value ?? value;
  const valid = isRouletteValue(shown);
  const angle = valid ? rouletteRestAngle(shown) : 0;

  useLayoutEffect(() => {
    if (!roll || !isRouletteValue(roll.value)) return;
    const wheel = wheelRef.current;
    const from = previousAngle.current;
    previousAngle.current = rouletteRestAngle(roll.value);
    if (reduced || !wheel || typeof wheel.animate !== 'function') return;
    const animation = wheel.animate(rouletteSpinKeyframes(from, roll.value), {
      duration: ROULETTE_ROLL_MS / speed,
      fill: 'none',
    });
    return () => animation.cancel();
  }, [rollKey, reduced, speed]);

  if (!roll && valid) previousAngle.current = angle;

  return (
    <div
      className={`roulette-tray${valid ? '' : ' is-idle'}`}
      {...fxAnchorProps({ kind: 'dice' })}
      role="group"
      aria-label="이동 룰렛"
      title={valid ? `이동 룰렛: ${shown}칸` : '이동 룰렛: 1~10칸'}
    >
      <div className="roulette-felt">
        <span className="roulette-pointer" aria-hidden="true" />
        <svg
          ref={wheelRef}
          className="roulette-wheel"
          viewBox="0 0 100 100"
          style={{ transform: `rotate(${angle}deg)` }}
          aria-hidden="true"
        >
          {ROULETTE_VALUES.map((sector, index) => {
            const pos = rouletteLabelPosition(index);
            return (
              <g key={sector}>
                <path
                  className={`roulette-sector sector-${index % 2}`}
                  d={rouletteSectorPath(index)}
                />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central">
                  {sector}
                </text>
              </g>
            );
          })}
          <circle className="roulette-hub" cx="50" cy="50" r="9" />
        </svg>
        <span className="roulette-caption" aria-hidden="true">
          1–10
        </span>
      </div>
      {valid && (
        <span
          key={rollKey ? rollId(rollKey) : 'rest'}
          className={`roulette-result${roll && !reduced ? ' is-new' : ''}`}
          style={{ animationDelay: roll && !reduced ? `${ROULETTE_LAND_MS / speed}ms` : '0ms' }}
          aria-hidden="true"
        >
          {shown}
        </span>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {valid ? `이동 룰렛 ${shown}칸` : '이동 룰렛 1부터 10까지'}
      </span>
    </div>
  );
}
