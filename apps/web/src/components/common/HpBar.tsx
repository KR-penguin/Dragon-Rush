interface HpBarProps {
  hp: number;
  maxHp: number;
  size?: 'sm' | 'md' | 'lg';
}

export function HpBar({ hp, maxHp, size = 'md' }: HpBarProps) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const tone = ratio <= 0.25 ? 'low' : ratio <= 0.5 ? 'mid' : 'high';
  return (
    <div
      className={`hp-bar hp-${size} hp-${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={maxHp}
      aria-valuenow={hp}
    >
      <div className="hp-fill" style={{ width: `${ratio * 100}%` }} />
      <span className="hp-text">
        {Math.max(0, hp)} / {maxHp}
      </span>
    </div>
  );
}
