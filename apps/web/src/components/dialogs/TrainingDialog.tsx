import type { UpgradeStat } from '@hero-dice/engine';
import type { StatOption } from '../../types/decisionView';
import { STAT_ICON, STAT_LABEL } from '../../types/labels';
import { Modal } from '../common/Modal';

interface TrainingDialogProps {
  options: readonly StatOption[];
  locked: boolean;
  onChoose: (stat: UpgradeStat) => void;
}

export function TrainingDialog({ options, locked, onChoose }: TrainingDialogProps) {
  return (
    <Modal className="training" title="🏋️ 수련장">
      <p>원하는 스탯 1단계를 무료로 강화합니다.</p>
      <div className="choice-grid">
        {options.map((o) => (
          <button
            key={o.stat}
            type="button"
            className="choice"
            disabled={locked || !o.legal}
            onClick={() => onChoose(o.stat)}
          >
            <span className="choice-icon">{STAT_ICON[o.stat]}</span>
            <span className="choice-head">{STAT_LABEL[o.stat]}</span>
            <span>
              {o.current} → <strong>{o.next}</strong>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
