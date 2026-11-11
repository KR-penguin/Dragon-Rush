import type { UpgradeStat } from '@dragon-rush/engine';
import type { StatOption } from '../../types/decisionView';
import { COIN_ICON, STAT_ICON, STAT_LABEL } from '../../types/labels';

interface UpgradePanelProps {
  options: readonly StatOption[];
  disabled: boolean;
  onUpgrade: (stat: UpgradeStat) => void;
}

export function UpgradePanel({ options, disabled, onUpgrade }: UpgradePanelProps) {
  return (
    <div className="upgrade-panel" role="group" aria-label="스탯 강화">
      <span className="upgrade-title">강화</span>
      {options.map((o) => (
        <button
          key={o.stat}
          type="button"
          className="upgrade-btn"
          disabled={disabled || !o.legal}
          onClick={() => onUpgrade(o.stat)}
          title={`${STAT_LABEL[o.stat]} ${o.current} → ${o.next}`}
        >
          <span className="upgrade-stat">
            {STAT_ICON[o.stat]} {STAT_LABEL[o.stat]}
          </span>
          <span className="upgrade-preview">
            {o.current} → <strong>{o.next}</strong>
          </span>
          <span className="upgrade-cost">
            {COIN_ICON} {o.cost}
          </span>
        </button>
      ))}
    </div>
  );
}
