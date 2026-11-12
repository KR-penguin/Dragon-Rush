import type { CSSProperties } from 'react';
import { fxAnchorProps } from '../../types/fxAnchor';
import { dragonIntentCue, type LairState } from '../../types/lairView';
import { CATEGORIES, CATEGORY_LABEL, type TileCategory } from '../../types/tileView';
import { DragonArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

interface DragonLairProps {
  dragon: {
    readonly hp: number;
    readonly atk: number;
    readonly def: number;
    readonly breathEvery: number;
  };
  state: LairState;
  round: number;
  /** Breath runes lit in the current dragon fight (0 when no fight). */
  breathLit: number;
  legend: TileCategory | null;
  onLegend: (category: TileCategory | null) => void;
}

const EMBERS = 9;
const HP_SEGMENTS = 10;

/**
 * Board centre, cosmetic only: a basalt crater with lava cracks and embers, the dragon (asleep,
 * awake when a challenge is possible, roaring in a fight), its stat plate, breath runes and the
 * tile legend.
 */
export function DragonLair({ dragon, state, round, breathLit, legend, onLegend }: DragonLairProps) {
  // The lair glows a little hotter every round (+2 %, capped at +30 %).
  const style = { '--ember-boost': Math.min(round * 0.02, 0.3) } as CSSProperties;
  const label = state === 'asleep' ? '잠든 용' : state === 'awake' ? '깨어난 용' : '포효하는 용';
  const intent = dragonIntentCue(state, dragon.breathEvery);
  return (
    <div className={`lair lair-${state}`} style={style}>
      <div className="lair-floor">
        <div className="lair-lava" />
        <div className="lair-ring" />
      </div>

      <div className="lair-runes" aria-label={`브레스: ${dragon.breathEvery}번째 공격마다`}>
        {Array.from({ length: dragon.breathEvery }, (_, i) => (
          <span key={i} className={`rune-stone${i < breathLit ? ' is-lit' : ''}`}>
            <GameIcon name="rune" />
          </span>
        ))}
      </div>

      <div className="lair-intent" role="status">
        <strong>{intent.status}</strong>
        <span>{intent.breath}</span>
      </div>

      <div className="lair-stand">
        <div className="lair-glow" />
        <div className="lair-dragon" {...fxAnchorProps({ kind: 'lair' })} title={label}>
          <DragonArt className="lair-dragon-art" />
          {state === 'asleep' && (
            <span className="lair-zz" aria-hidden="true">
              <i>z</i>
              <i>z</i>
              <i>Z</i>
            </span>
          )}
        </div>
        <div className="lair-embers" aria-hidden="true">
          {Array.from({ length: EMBERS }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <div className="lair-plate">
          <span className="lair-plate-name">
            <GameIcon name="dragon" /> 드래곤
          </span>
          <span className="lair-scales" title={`체력 ${dragon.hp} (도전마다 회복)`}>
            {Array.from({ length: HP_SEGMENTS }, (_, i) => (
              <i key={i} />
            ))}
            <b className="num">{dragon.hp}</b>
          </span>
          <span className="lair-plate-stats">
            <span className="stat-inline" title="공격력">
              <GameIcon name="atk" />
              <strong>{dragon.atk}</strong>
            </span>
            <span className="stat-inline" title="방어력">
              <GameIcon name="def" />
              <strong>{dragon.def}</strong>
            </span>
            <span
              className="stat-inline lair-breath"
              title={`${dragon.breathEvery}번째 공격마다 방어 무시 브레스`}
            >
              <GameIcon name="breath" />
              <strong>{dragon.breathEvery}</strong>
            </span>
          </span>
        </div>
      </div>

      <div
        className="lair-legend"
        role="group"
        aria-label="칸 범례"
        onPointerLeave={() => onLegend(null)}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`legend-chip${legend === c ? ' is-on' : ''}`}
            onPointerEnter={() => onLegend(c)}
            onFocus={() => onLegend(c)}
            onBlur={() => onLegend(null)}
          >
            <span className={`tile-gem gem-${c}`} />
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
