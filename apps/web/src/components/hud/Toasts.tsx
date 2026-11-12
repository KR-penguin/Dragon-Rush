import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { TOAST_MS, type Toast } from '../../hooks/useToasts';
import { seatColor } from '../../types/labels';
import { GameIcon } from '../icons/GameIcon';

interface ToastsProps {
  toasts: readonly Toast[];
  onOpenChronicle: () => void;
}

/** The last three events as parchment slips; clicking one opens the chronicle. */
export function Toasts({ toasts, onOpenChronicle }: ToastsProps) {
  const boardToasts = toasts.filter((toast) => !toast.overlay);
  const notices = toasts.filter((toast) => toast.overlay);
  const renderList = (items: readonly Toast[], overlay: boolean) => (
    <ol
      className={overlay ? 'toasts toasts-overlay' : 'toasts'}
      aria-live="polite"
      style={{ '--toast-life': `${TOAST_MS}ms` } as CSSProperties}
    >
      {items.map((t) => (
        <li
          key={t.id}
          className="toast parchment"
          style={
            {
              '--seat-color': t.seat === null ? 'var(--gold-deep)' : seatColor(t.seat),
            } as CSSProperties
          }
        >
          {overlay ? (
            <div className="toast-notice">
              <GameIcon name={t.icon} className="toast-icon" />
              <span>{t.text}</span>
            </div>
          ) : (
            <button type="button" onClick={onOpenChronicle} title="연대기 열기">
              <GameIcon name={t.icon} className="toast-icon" />
              <span>{t.text}</span>
            </button>
          )}
        </li>
      ))}
    </ol>
  );
  return (
    <>
      {renderList(boardToasts, false)}
      {notices.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(renderList(notices, true), document.body)}
    </>
  );
}
