import type { SeatId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import type { OpponentSummary } from '../../types/decisionView';
import { seatColor, seatCrest } from '../../types/labels';
import { Crest } from '../icons/Crest';
import { GameIcon } from '../icons/GameIcon';

interface ThiefDialogProps {
  targets: readonly { readonly name: string; readonly summary: OpponentSummary }[];
  stealMax: number;
  locked: boolean;
  onChoose: (seat: SeatId) => void;
  onClose: () => void;
}

/**
 * Thief targeting: the world dims and the targets' corner cards get gold rims (click one there),
 * with this strip as the keyboard-friendly list.
 */
export function ThiefDialog({ targets, stealMax, locked, onChoose, onClose }: ThiefDialogProps) {
  return (
    <div className="targeting-panel" role="dialog" aria-label="도둑 사용">
      <header>
        <GameIcon name="thief" className="targeting-icon" />
        <div>
          <strong>도둑 사용</strong>
          <span>금빛 테두리 카드를 골라 코인을 최대 {stealMax}개 훔치세요.</span>
        </div>
      </header>
      <ul>
        {targets.map((t) => (
          <li key={t.summary.seat}>
            <button
              type="button"
              className="target-pill"
              style={{ '--seat-color': seatColor(t.summary.seat) } as CSSProperties}
              disabled={locked}
              onClick={() => onChoose(t.summary.seat)}
            >
              <Crest shape={seatCrest(t.summary.seat)} />
              {t.name}
              <span className="stat-inline">
                <GameIcon name="coins" />
                <strong>{t.summary.coins}</strong>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        취소 <kbd>Esc</kbd>
      </button>
    </div>
  );
}
