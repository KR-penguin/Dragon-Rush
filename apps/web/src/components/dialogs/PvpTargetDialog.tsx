import type { SeatId } from '@dragon-rush/engine';
import type { OpponentSummary } from '../../types/decisionView';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';
import { GameIcon } from '../icons/GameIcon';

export interface TargetOption {
  readonly name: string;
  readonly summary: OpponentSummary;
}

interface PvpTargetDialogProps {
  targets: readonly TargetOption[];
  locked: boolean;
  onChoose: (seat: SeatId) => void;
}

/** Challenge scroll: pick one opponent sharing the tile. */
export function PvpTargetDialog({ targets, locked, onChoose }: PvpTargetDialogProps) {
  const single = targets.length === 1;
  return (
    <Modal
      className="modal-scroll"
      icon="duel"
      kicker="같은 칸에서 마주쳤습니다"
      title={single ? '결투 발생' : '결투 상대 선택'}
    >
      <p>
        {single
          ? '같은 칸에 도착해 결투가 발생했습니다. 방어막이 있으면 다음 단계에서 사용할 수 있습니다.'
          : '이 칸에 여러 명이 있습니다. 결투할 상대 1명을 고르세요.'}
      </p>
      <ul className="target-list">
        {targets.map((t) => (
          <li key={t.summary.seat}>
            <SeatChip name={t.name} summary={t.summary} />
            <button
              type="button"
              className="btn btn-danger"
              disabled={locked}
              onClick={() => onChoose(t.summary.seat)}
            >
              <GameIcon name="duel" /> {single ? '결투 시작' : '결투'}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
