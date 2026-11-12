import type { CSSProperties } from 'react';
import { formatPercent } from '../../types/estimates';

interface WinChanceProps {
  label: string;
  chance: number | null;
  method: 'dice' | 'realtime';
}

/** "용의 눈": the estimated win probability as a fortune eye that glows hotter with the odds. */
export function WinChance({ label, chance, method }: WinChanceProps) {
  const tone = chance === null ? 'even' : chance >= 0.7 ? 'good' : chance >= 0.45 ? 'even' : 'bad';
  return (
    <div className={`dragon-eye win-${tone}`} style={{ '--chance': chance ?? 0 } as CSSProperties}>
      <span className="dragon-eye-orb" aria-hidden="true" />
      <div className="dragon-eye-head">
        <span>
          용의 눈 · <span className="muted">{label}</span>
        </span>
        <strong>{chance === null ? '예측 준비 중' : formatPercent(chance)}</strong>
      </div>
      {chance !== null && (
        <div
          className="dragon-eye-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(chance * 100)}
          aria-label={label}
        >
          <div style={{ width: `${Math.round(chance * 100)}%` }} />
        </div>
      )}
      <small>
        {method === 'dice'
          ? '몬테카를로 추정치이며 실제 결과는 주사위에 달려 있습니다.'
          : chance === null
            ? 'AI 승률 예측 준비 중입니다. 실제 결과는 실시간 전투에 달려 있습니다.'
            : 'AI 승률 예측치입니다. 실제 결과는 실시간 전투에 달려 있습니다.'}
      </small>
    </div>
  );
}
