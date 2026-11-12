import type { ReactNode } from 'react';
import type { IconName } from '../../types/icons';
import { GameIcon } from '../icons/GameIcon';

interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Omit for decisions that must be answered. */
  onClose?: () => void;
  /** Prop skin, e.g. `modal-scroll`, `modal-stall`, `modal-anvil`. */
  className?: string;
  /** Emblem drawn in the header seal. */
  icon?: IconName;
  /** Small caption above the title. */
  kicker?: ReactNode;
}

/** Dialogs are table props (scroll, stall, anvil); the skin comes from `className`. */
export function Modal({
  title,
  children,
  footer,
  onClose,
  className = '',
  icon,
  kicker,
}: ModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true">
        <header className="modal-header">
          {icon && (
            <span className="modal-seal" aria-hidden="true">
              <GameIcon name={icon} />
            </span>
          )}
          <div className="modal-titles">
            {kicker && <span className="modal-kicker">{kicker}</span>}
            <h2>{title}</h2>
          </div>
          {onClose && (
            <button
              type="button"
              className="icon-btn modal-close"
              onClick={onClose}
              aria-label="닫기"
            >
              <GameIcon name="close" />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
