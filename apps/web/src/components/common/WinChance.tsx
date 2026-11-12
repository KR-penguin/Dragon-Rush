import type { CSSProperties } from 'react';
import { formatPercent } from '../../types/estimates';

interface WinChanceProps {
  label: string;
  chance: number;
}

/** "용의 눈": the estimated win probability as a fortune eye that glows hotter with the odds. */
export function WinChance({ label, chance }: WinChanceProps) {
  const tone = chance >= 0.7 ? 'good' : chance >= 0.45 ? 'even' : 'bad';
  return (
    <div className={`dragon-eye win-${tone}`} style={{ '--chance': chance } as CSSProperties}>
      <span className="dragon-eye-orb" aria-hidden="true" />
      <div className="dragon-eye-head">
        <span>
          용의 눈 · <span className="muted">{label}</span>
        </span>
        <strong>{formatPercent(chance)}</strong>
      </div>
      <div className="dragon-eye-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(chance * 100)} aria-label={label}>
        <div style={{ width: `${Math.round(chance * 100)}%` }} />
      </div>
      <small>몬테카를로 추정치이며 실제 결과는 주사위에 달려 있습니다.</small>
    </div>
  );
}
