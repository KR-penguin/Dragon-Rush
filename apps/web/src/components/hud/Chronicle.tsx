import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../store/gameStore';
import { GameIcon } from '../icons/GameIcon';

interface ChronicleProps {
  entries: readonly LogEntry[];
  onClose: () => void;
}

/** "연대기": the full game log on a parchment scroll that slides in from the right. */
export function Chronicle({ entries, onClose }: ChronicleProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);
  return (
    <div
      className="chronicle-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="chronicle parchment" role="dialog" aria-modal="true" aria-label="연대기">
        <header className="chronicle-head">
          <GameIcon name="chronicle" />
          <h2>연대기</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="연대기 닫기">
            <GameIcon name="close" />
          </button>
        </header>
        <ol ref={listRef} className="chronicle-list">
          {entries.length === 0 && <li className="chronicle-empty">아직 기록이 없습니다.</li>}
          {entries.map((e) => (
            <li key={e.id} className={e.text.startsWith('—') ? 'chronicle-round' : undefined}>
              {e.text}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
