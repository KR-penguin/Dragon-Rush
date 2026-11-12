import type { UpgradeStat } from '@dragon-rush/engine';
import type { StatOption } from '../../types/decisionView';
import { STAT_ICON_NAME } from '../../types/icons';
import { STAT_LABEL } from '../../types/labels';
import { Modal } from '../common/Modal';
import { GameIcon } from '../icons/GameIcon';

interface TrainingDialogProps {
  options: readonly StatOption[];
  locked: boolean;
  onChoose: (stat: UpgradeStat) => void;
}

/** Training ground: stat cards laid on an anvil; striking one upgrades it for free. */
export function TrainingDialog({ options, locked, onChoose }: TrainingDialogProps) {
  return (
    <Modal
      className="modal-anvil"
      icon="training"
      kicker="교관이 한 가지를 가르쳐 준다"
      title="수련장"
    >
      <p className="anvil-note">원하는 스탯 1단계를 무료로 강화합니다.</p>
      <div className="anvil-stage">
        <div className="anvil-cards">
          {options.map((o) => (
            <button
              key={o.stat}
              type="button"
              className={`stat-card parchment${o.legal ? '' : ' is-locked'}`}
              disabled={locked || !o.legal}
              onClick={() => onChoose(o.stat)}
            >
              <GameIcon name={STAT_ICON_NAME[o.stat]} className="stat-card-icon" />
              <span className="stat-card-name">{STAT_LABEL[o.stat]}</span>
              <span className="stat-card-value impact">
                {o.current} <i>→</i> {o.next}
              </span>
              <span className="stat-card-free">무료</span>
            </button>
          ))}
        </div>
        <div className="anvil-block" aria-hidden="true">
          <GameIcon name="anvil" />
        </div>
      </div>
    </Modal>
  );
}
