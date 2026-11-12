import type { MoveDelta } from '../../types/actionGroups';
import type { MoveOption } from '../../types/decisionView';
import { TILE_LABEL } from '../../types/labels';
import { TileArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

interface MoveAdjustDialogProps {
  dice: number | null;
  options: readonly MoveOption[];
  locked: boolean;
  onChoose: (delta: MoveDelta) => void;
  /** Highlights the destination on the board while an option is hovered. */
  onPreview?: (tile: number | null) => void;
}

const deltaLabel = (d: MoveDelta): string => (d < 0 ? '−1' : d > 0 ? '+1' : '그대로');

/** Ninja's shadow step: arrow buttons docked beside the die, each naming where it lands. */
export function MoveAdjustDialog({
  dice,
  options,
  locked,
  onChoose,
  onPreview,
}: MoveAdjustDialogProps) {
  return (
    <div className="move-adjust" role="dialog" aria-label="그림자 걸음">
      <header>
        <GameIcon name="footsteps" />
        <strong>그림자 걸음</strong>
        <span>
          주사위 <b className="impact">{dice ?? '?'}</b> · ±1을 쓰면 쿨다운이 걸립니다
        </span>
      </header>
      <div className="move-options" onPointerLeave={() => onPreview?.(null)}>
        {options.map((o) => (
          <button
            key={o.delta}
            type="button"
            className={`move-option move-${o.delta < 0 ? 'minus' : o.delta > 0 ? 'plus' : 'stay'}`}
            disabled={locked}
            onClick={() => {
              onPreview?.(null);
              onChoose(o.delta);
            }}
            onPointerEnter={() => onPreview?.(o.tile)}
            onFocus={() => onPreview?.(o.tile)}
            onBlur={() => onPreview?.(null)}
          >
            <span className="move-delta impact">{deltaLabel(o.delta)}</span>
            <TileArt tileId={o.tileId} className="move-tile-art" />
            <span className="move-dest">
              {o.steps}칸 → {TILE_LABEL[o.tileId]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
