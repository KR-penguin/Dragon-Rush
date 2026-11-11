import type { CSSProperties } from 'react';
import type { OpponentSummary } from '../../types/decisionView';
import { jobImagePath } from '../../types/assetPaths';
import { COIN_ICON, JOB_ICON, JOB_LABEL, seatColor } from '../../types/labels';
import { AssetImage } from './AssetImage';
import { HpBar } from './HpBar';

interface SeatChipProps {
  name: string;
  summary: OpponentSummary;
}

/** Compact player card for choice dialogs. */
export function SeatChip({ name, summary }: SeatChipProps) {
  return (
    <div className="seat-chip" style={{ '--seat-color': seatColor(summary.seat) } as CSSProperties}>
      <AssetImage
        className="seat-chip-job"
        path={jobImagePath(summary.job)}
        fallback={JOB_ICON[summary.job]}
        alt={JOB_LABEL[summary.job]}
      />
      <div className="seat-chip-body">
        <strong>{name}</strong>
        <HpBar hp={summary.hp} maxHp={summary.maxHp} size="sm" />
        <span className="seat-chip-stats">
          ⚔️ {summary.atk} · 🛡️ {summary.def} · {COIN_ICON} {summary.coins}
        </span>
      </div>
    </div>
  );
}
