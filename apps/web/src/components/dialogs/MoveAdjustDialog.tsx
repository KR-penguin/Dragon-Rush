import type { MoveDelta } from '../../types/actionGroups';
import type { MoveOption } from '../../types/decisionView';
import { TILE_ICON, TILE_LABEL } from '../../types/labels';
import { Modal } from '../common/Modal';

interface MoveAdjustDialogProps {
  dice: number | null;
  options: readonly MoveOption[];
  locked: boolean;
  onChoose: (delta: MoveDelta) => void;
}

const deltaLabel = (d: MoveDelta): string => (d < 0 ? '−1' : d > 0 ? '+1' : '그대로');

export function MoveAdjustDialog({ dice, options, locked, onChoose }: MoveAdjustDialogProps) {
  return (
    <Modal className="move-adjust" title="🥷 그림자 걸음">
      <p>
        주사위 <strong>{dice ?? '?'}</strong>. 이동 칸 수를 보정하세요. ±1을 쓰면 쿨다운이 걸립니다.
      </p>
      <div className="choice-grid">
        {options.map((o) => (
          <button
            key={o.delta}
            type="button"
            className="choice"
            disabled={locked}
            onClick={() => onChoose(o.delta)}
          >
            <span className="choice-head">{deltaLabel(o.delta)}</span>
            <span className="choice-icon">{TILE_ICON[o.tileId]}</span>
            <span>
              {o.steps}칸 → {TILE_LABEL[o.tileId]}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
