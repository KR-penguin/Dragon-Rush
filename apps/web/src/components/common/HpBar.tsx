import { fxAnchorProps, type FxAnchor } from '../../types/fxAnchor';
import { CountUp } from './CountUp';

interface HpBarProps {
  hp: number;
  maxHp: number;
  size?: 'sm' | 'md' | 'lg';
  /** Count the number instead of jumping (corner cards); reduced motion jumps. */
  countUp?: { readonly reduced: boolean };
  anchor?: FxAnchor;
}

/** HP bar; a pale ghost drains 400 ms after the hit so the lost chunk reads. */
export function HpBar({ hp, maxHp, size = 'md', countUp, anchor }: HpBarProps) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const tone = ratio <= 0.25 ? 'low' : ratio <= 0.5 ? 'mid' : 'high';
  const value = Math.max(0, hp);
  return (
    <div
      className={`hp-bar hp-${size} hp-${tone}`}
      role="meter"
      aria-label="체력"
      aria-valuemin={0}
      aria-valuemax={maxHp}
      aria-valuenow={hp}
      {...(anchor ? fxAnchorProps(anchor) : {})}
    >
      <div className="hp-ghost" style={{ width: `${ratio * 100}%` }} />
      <div className="hp-fill" style={{ width: `${ratio * 100}%` }} />
      <span className="hp-text">
        {countUp ? <CountUp value={value} reduced={countUp.reduced} /> : value} / {maxHp}
      </span>
    </div>
  );
}
