import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../store/gameStore';

export function GameLog({ entries }: { entries: readonly LogEntry[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);
  return (
    <section className="game-log">
      <h3>게임 기록</h3>
      <ol ref={listRef}>
        {entries.map((e) => (
          <li key={e.id} className={e.text.startsWith('—') ? 'log-round' : undefined}>
            {e.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
