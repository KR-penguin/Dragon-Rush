import type { AnimationSpeed } from '../../store/gameStore';

const SPEEDS: readonly AnimationSpeed[] = [1, 2, 4];

interface TopBarProps {
  round: number;
  speed: AnimationSpeed;
  canSkip: boolean;
  muted: boolean;
  onSpeed: (speed: AnimationSpeed) => void;
  onSkip: () => void;
  onToggleMute: () => void;
  onExit: () => void;
}

export function TopBar({
  round,
  speed,
  canSkip,
  muted,
  onSpeed,
  onSkip,
  onToggleMute,
  onExit,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark">🎲</span> 드래곤 러쉬
      </div>
      <div className="round-chip">{round}라운드</div>
      <div className="top-controls">
        <div className="segmented" role="group" aria-label="연출 속도">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={s === speed ? 'is-on' : undefined}
              aria-pressed={s === speed}
              onClick={() => onSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" disabled={!canSkip} onClick={onSkip}>
          ⏭ 건너뛰기
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleMute}
          aria-label={muted ? '소리 켜기' : '소리 끄기'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onExit}>
          나가기
        </button>
      </div>
    </header>
  );
}
