import type { CSSProperties } from 'react';
import type { OpponentSummary } from '../../types/decisionView';
import { seatColor, seatCrest } from '../../types/labels';
import { JobArt } from '../icons/Art';
import { Crest } from '../icons/Crest';
import { GameIcon } from '../icons/GameIcon';
import { HpBar } from './HpBar';

interface SeatChipProps {
  name: string;
  summary: OpponentSummary;
}

/** Compact player card for choice dialogs. */
export function SeatChip({ name, summary }: SeatChipProps) {
  return (
    <div className="seat-chip" style={{ '--seat-color': seatColor(summary.seat) } as CSSProperties}>
      <JobArt job={summary.job} className="seat-chip-job" />
      <div className="seat-chip-body">
        <strong className="seat-chip-name">
          <Crest shape={seatCrest(summary.seat)} />
          {name}
        </strong>
        <HpBar hp={summary.hp} maxHp={summary.maxHp} size="sm" />
        <span className="seat-chip-stats">
          <span className="stat-inline" title="공격력">
            <GameIcon name="atk" />
            <strong>{summary.atk}</strong>
          </span>
          <span className="stat-inline" title="방어력">
            <GameIcon name="def" />
            <strong>{summary.def}</strong>
          </span>
          <span className="stat-inline" title="코인">
            <GameIcon name="coins" />
            <strong>{summary.coins}</strong>
          </span>
          {summary.shields > 0 && (
            <span className="stat-inline" title="방어막">
              <GameIcon name="shield" />
              <strong>{summary.shields}</strong>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
