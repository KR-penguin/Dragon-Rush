import type { SeatId } from '@dragon-rush/engine';
import type { OpponentSummary } from '../../types/decisionView';
import { formatPercent } from '../../types/estimates';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';
import { GameIcon } from '../icons/GameIcon';

export interface TargetOption {
  readonly name: string;
  readonly summary: OpponentSummary;
  /** Estimated duel win chance against this target, if known. */
  readonly chance: number | null;
}

interface PvpTargetDialogProps {
  targets: readonly TargetOption[];
  locked: boolean;
  onChoose: (seat: SeatId) => void;
}

/** Challenge scroll: pick one opponent sharing the tile. */
export function PvpTargetDialog({ targets, locked, onChoose }: PvpTargetDialogProps) {
  return (
    <Modal className="modal-scroll" icon="duel" kicker="결투장" title="결투 상대 선택">
      <p>이 칸에 여러 명이 있습니다. 결투할 상대 1명을 고르세요.</p>
      <ul className="target-list">
        {targets.map((t) => (
          <li key={t.summary.seat}>
            <SeatChip name={t.name} summary={t.summary} />
            {t.chance !== null && (
              <span className="target-chance" title="용의 눈 예상 승률">
                <GameIcon name="eye" /> {formatPercent(t.chance)}
              </span>
            )}
            <button type="button" className="btn btn-danger" disabled={locked} onClick={() => onChoose(t.summary.seat)}>
              <GameIcon name="duel" /> 결투
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
