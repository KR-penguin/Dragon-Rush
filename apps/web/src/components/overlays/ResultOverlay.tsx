import type { CSSProperties } from 'react';
import { jobImagePath } from '../../types/assetPaths';
import { COIN_ICON, JOB_ICON, JOB_LABEL, seatColor } from '../../types/labels';
import type { ResultRow } from '../../types/resultView';
import { AssetImage } from '../common/AssetImage';

interface ResultOverlayProps {
  title: string;
  kind: string;
  rounds: number;
  rows: readonly ResultRow[];
  onRestart: (() => void) | null;
  onHome: () => void;
  homeLabel: string;
}

export function ResultOverlay({
  title,
  kind,
  rounds,
  rows,
  onRestart,
  onHome,
  homeLabel,
}: ResultOverlayProps) {
  return (
    <div className="result-overlay" role="dialog" aria-label="게임 결과">
      <div className="result-card">
        <div className="result-kind">{kind}</div>
        <h2 className="result-title">{title}</h2>
        <p className="muted">{rounds}라운드 만에 게임이 끝났습니다.</p>
        <table className="result-table">
          <thead>
            <tr>
              <th>플레이어</th>
              <th>결과</th>
              <th>HP</th>
              <th>⚔️</th>
              <th>🛡️</th>
              <th>{COIN_ICON}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.seat}
                className={r.winner ? 'is-winner' : r.alive ? undefined : 'is-out'}
                style={{ '--seat-color': seatColor(r.seat) } as CSSProperties}
              >
                <td className="result-player">
                  <AssetImage
                    path={jobImagePath(r.job)}
                    fallback={JOB_ICON[r.job]}
                    alt={JOB_LABEL[r.job]}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{JOB_LABEL[r.job]}</small>
                  </span>
                </td>
                <td>{r.status}</td>
                <td>{r.alive ? `${r.hp}/${r.maxHp}` : '—'}</td>
                <td>{r.atk}</td>
                <td>{r.def}</td>
                <td>{r.alive ? r.coins : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="result-actions">
          {onRestart && (
            <button type="button" className="btn btn-primary btn-lg" onClick={onRestart}>
              🔁 다시 하기
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-lg" onClick={onHome}>
            {homeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
