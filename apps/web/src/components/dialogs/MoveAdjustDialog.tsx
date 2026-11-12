import type { MoveDelta } from '../../types/actionGroups';
import type { MoveOption } from '../../types/decisionView';
import { signed } from '../../types/tileView';
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

/** Ninja's shadow step: destination and effects stay readable inside each choice. */
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
          룰렛 <b className="impact">{dice ?? '?'}</b> · 도착 칸을 선택하세요
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
            <span className="move-choice-head">
              <span className="move-delta impact">{deltaLabel(o.delta)}</span>
              <span className="move-steps">{o.steps}칸 이동</span>
            </span>
            <span className="move-dest">
              <span aria-hidden="true" className="move-tile-icon">
                <TileArt tileId={o.tileId} className="move-tile-art" />
              </span>
              <span className="move-dest-text">
                <small>{o.tile}번 칸</small>
                <strong>{o.tileName}</strong>
              </span>
            </span>
            <span className="move-effects">
              {o.effects.length === 0 && !o.startBonus && (
                <span className="move-effect move-effect-neutral">도착 효과 없음</span>
              )}
              {o.effects.map((effect, index) => (
                <span className={`move-effect move-effect-${effect.tone}`} key={index}>
                  {effect.label}
                  {effect.amount === null ? '' : ` ${signed(effect.amount)}`}
                </span>
              ))}
              {o.startBonus && (
                <span className="move-start-bonus">
                  출발 통과 보너스: 코인 {signed(o.startBonus.coins)} · HP {signed(o.startBonus.hp)}
                </span>
              )}
            </span>
            <span className="move-cooldown">
              {o.cooldownTurns === 2 ? '다음 내 턴 사용 불가' : `쿨다운 ${o.cooldownTurns}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
