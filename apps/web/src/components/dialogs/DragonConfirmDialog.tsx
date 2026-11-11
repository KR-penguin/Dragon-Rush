import { DRAGON_ICON } from '../../types/labels';
import type { OpponentSummary } from '../../types/decisionView';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';
import { WinChance } from '../common/WinChance';

interface DragonConfirmDialogProps {
  name: string;
  me: OpponentSummary;
  dragon: { readonly hp: number; readonly atk: number; readonly def: number };
  chance: number;
  locked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DragonConfirmDialog({
  name,
  me,
  dragon,
  chance,
  locked,
  onConfirm,
  onCancel,
}: DragonConfirmDialogProps) {
  return (
    <Modal
      className="dragon-confirm"
      title={`${DRAGON_ICON} 용에게 도전할까요?`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-danger" disabled={locked} onClick={onConfirm}>
            도전한다!
          </button>
        </>
      }
    >
      <div className="versus">
        <SeatChip name={name} summary={me} />
        <span className="versus-mark">VS</span>
        <div className="dragon-chip">
          <span className="dragon-chip-icon">{DRAGON_ICON}</span>
          <span>
            ❤️ {dragon.hp} · ⚔️ {dragon.atk} · 🛡️ {dragon.def}
          </span>
        </div>
      </div>
      <WinChance label="예상 승리 확률" chance={chance} />
      <p className="warning">
        이기면 즉시 승리합니다. 지면 탈락하고 코인과 아이템이 모두 사라집니다.
      </p>
    </Modal>
  );
}
