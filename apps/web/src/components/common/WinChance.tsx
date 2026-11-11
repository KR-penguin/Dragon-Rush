import { formatPercent } from '../../types/estimates';

interface WinChanceProps {
  label: string;
  chance: number;
}

/** Estimated win probability gauge. */
export function WinChance({ label, chance }: WinChanceProps) {
  const tone = chance >= 0.7 ? 'good' : chance >= 0.45 ? 'even' : 'bad';
  return (
    <div className={`win-chance win-${tone}`}>
      <div className="win-chance-head">
        <span>{label}</span>
        <strong>{formatPercent(chance)}</strong>
      </div>
      <div className="win-chance-bar">
        <div style={{ width: `${Math.round(chance * 100)}%` }} />
      </div>
      <small>몬테카를로 추정치이며 실제 결과는 주사위에 달려 있습니다.</small>
    </div>
  );
}
