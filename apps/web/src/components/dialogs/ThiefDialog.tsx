import type { SeatId } from '@dragon-rush/engine';
import type { OpponentSummary } from '../../types/decisionView';
import { ITEM_ICON } from '../../types/labels';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';

interface ThiefDialogProps {
  targets: readonly { readonly name: string; readonly summary: OpponentSummary }[];
  stealMax: number;
  locked: boolean;
  onChoose: (seat: SeatId) => void;
  onClose: () => void;
}

export function ThiefDialog({ targets, stealMax, locked, onChoose, onClose }: ThiefDialogProps) {
  return (
    <Modal
      className="thief"
      title={`${ITEM_ICON.thief} 도둑 사용`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          취소
        </button>
      }
    >
      <p>코인을 훔칠 상대를 고르세요. 최대 {stealMax}개를 가져옵니다.</p>
      <ul className="target-list">
        {targets.map((t) => (
          <li key={t.summary.seat}>
            <SeatChip name={t.name} summary={t.summary} />
            <button
              type="button"
              className="btn btn-primary"
              disabled={locked}
              onClick={() => onChoose(t.summary.seat)}
            >
              훔치기
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
