import type { OpponentSummary } from '../../types/decisionView';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';
import { DragonArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

interface DragonConfirmDialogProps {
  name: string;
  me: OpponentSummary;
  dragon: { readonly hp: number; readonly atk: number; readonly def: number };
  locked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Challenge scroll sealed in crimson wax. */
export function DragonConfirmDialog({
  name,
  me,
  dragon,
  locked,
  onConfirm,
  onCancel,
}: DragonConfirmDialogProps) {
  return (
    <Modal
      className="modal-scroll modal-crimson"
      icon="dragon"
      kicker="도전장"
      title="용에게 도전할까요?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            물러난다
          </button>
          <button
            type="button"
            className="btn btn-danger btn-lg"
            disabled={locked}
            onClick={onConfirm}
          >
            <GameIcon name="duel" /> 도전한다!
          </button>
        </>
      }
    >
      <div className="versus">
        <SeatChip name={name} summary={me} />
        <span className="versus-mark">VS</span>
        <div className="dragon-chip">
          <DragonArt className="dragon-chip-art" />
          <span className="dragon-chip-stats">
            <span className="stat-inline" title="체력">
              <GameIcon name="hp" />
              <strong>{dragon.hp}</strong>
            </span>
            <span className="stat-inline" title="공격력">
              <GameIcon name="atk" />
              <strong>{dragon.atk}</strong>
            </span>
            <span className="stat-inline" title="방어력">
              <GameIcon name="def" />
              <strong>{dragon.def}</strong>
            </span>
          </span>
        </div>
      </div>
      <p className="warning">
        이기면 즉시 승리합니다. 지면 탈락하고 코인과 아이템이 모두 사라집니다.
      </p>
    </Modal>
  );
}
