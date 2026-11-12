import type { UpgradeStat } from '@dragon-rush/engine';
import type { StatOption } from '../../types/decisionView';
import { STAT_ICON_NAME } from '../../types/icons';
import { STAT_LABEL } from '../../types/labels';
import { GameIcon } from '../icons/GameIcon';

interface AnvilTrayProps {
  options: readonly StatOption[];
  coins: number;
  used: number;
  limit: number;
  disabled: boolean;
  onUpgrade: (stat: UpgradeStat) => void;
  onClose: () => void;
}

/** Stat upgrades as cards laid on an anvil tray that opens from the dock. */
export function AnvilTray({
  options,
  coins,
  used,
  limit,
  disabled,
  onUpgrade,
  onClose,
}: AnvilTrayProps) {
  return (
    <div className="anvil-tray" role="group" aria-label="스탯 강화">
      <header className="anvil-tray-head">
        <GameIcon name="anvil" />
        <strong>이번 턴 강화 {used}/{limit}</strong>
        <span className="anvil-tray-coins">
          <GameIcon name="coins" /> <b className="impact">{coins}</b>
        </span>
        <button
          type="button"
          className="icon-btn anvil-close"
          onClick={onClose}
          aria-label="강화 닫기"
        >
          <GameIcon name="close" />
        </button>
      </header>
      <div className="anvil-cards">
        {options.map((o) => (
          <button
            key={o.stat}
            type="button"
            className={`stat-card parchment${o.legal ? '' : ' is-locked'}`}
            disabled={disabled || !o.legal}
            onClick={() => onUpgrade(o.stat)}
            title={`${STAT_LABEL[o.stat]} ${o.current} → ${o.next}`}
          >
            <GameIcon name={STAT_ICON_NAME[o.stat]} className="stat-card-icon" />
            <span className="stat-card-name">{STAT_LABEL[o.stat]}</span>
            <span className="stat-card-value impact">
              {o.current} <i>→</i> {o.next}
            </span>
            <span className="price-tag">
              <GameIcon name="coins" /> <b className="impact">{o.cost}</b>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
