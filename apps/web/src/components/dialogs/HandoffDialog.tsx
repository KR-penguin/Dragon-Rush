import type { CSSProperties } from 'react';
import { Modal } from '../common/Modal';

interface HandoffDialogProps {
  name: string;
  color: string;
  phaseLabel: string;
  onConfirm: () => void;
}

/** Hot-seat hand-off: tells the table whose decision comes next. */
export function HandoffDialog({ name, color, phaseLabel, onConfirm }: HandoffDialogProps) {
  return (
    <Modal
      className="handoff"
      title={
        <span style={{ '--seat-color': color } as CSSProperties} className="handoff-name">
          {name}님의 결정입니다
        </span>
      }
      footer={
        <button type="button" className="btn btn-primary btn-lg" onClick={onConfirm} autoFocus>
          확인
        </button>
      }
    >
      <p>
        다음 결정: <strong>{phaseLabel}</strong>
      </p>
      <p className="muted">{name}님이 화면 앞에 앉으면 확인을 누르세요.</p>
    </Modal>
  );
}
