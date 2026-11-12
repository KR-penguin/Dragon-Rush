import type { ReactNode } from 'react';
import type { IconName } from '../../types/icons';
import { GameIcon } from '../icons/GameIcon';

interface TargetBannerProps {
  icon: IconName;
  children: ReactNode;
  onCancel?: () => void;
}

/** Instruction ribbon shown while the world is dimmed for targeting (teleport, thief). */
export function TargetBanner({ icon, children, onCancel }: TargetBannerProps) {
  return (
    <div className="target-banner" role="status">
      <GameIcon name={icon} className="target-banner-icon" />
      <span>{children}</span>
      {onCancel && (
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          취소 <kbd>Esc</kbd>
        </button>
      )}
    </div>
  );
}
