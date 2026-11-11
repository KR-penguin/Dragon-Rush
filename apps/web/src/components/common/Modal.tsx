import type { ReactNode } from 'react';

interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Omit for decisions that must be answered. */
  onClose?: () => void;
  className?: string;
}

export function Modal({ title, children, footer, onClose, className = '' }: ModalProps) {
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
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
