import type { CSSProperties } from 'react';
import type { Toast } from '../../hooks/useToasts';
import { seatColor } from '../../types/labels';
import { GameIcon } from '../icons/GameIcon';

interface ToastsProps {
  toasts: readonly Toast[];
  onOpenChronicle: () => void;
}

/** The last three events as parchment slips; clicking one opens the chronicle. */
export function Toasts({ toasts, onOpenChronicle }: ToastsProps) {
  return (
    <ol className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <li
          key={t.id}
          className="toast parchment"
          style={{ '--seat-color': t.seat === null ? 'var(--gold-deep)' : seatColor(t.seat) } as CSSProperties}
        >
          <button type="button" onClick={onOpenChronicle} title="연대기 열기">
            <GameIcon name={t.icon} className="toast-icon" />
            <span>{t.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
