import type { JobId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { JOB_LABEL, seatColor, seatCrest } from '../../types/labels';
import type { ResultRow } from '../../types/resultView';
import { DragonArt, JobArt } from '../icons/Art';
import { Crest } from '../icons/Crest';
import { GameIcon } from '../icons/GameIcon';

interface ResultOverlayProps {
  title: string;
  kind: string;
  rounds: number;
  rows: readonly ResultRow[];
  /** Winner's job for the standee on the podium, or null for a draw. */
  winnerJob?: JobId | null;
  winnerColor?: string | null;
  onRestart: (() => void) | null;
  onHome: () => void;
  homeLabel: string;
}

/** Victory banner, the winner's standee and the final standings on parchment. */
export function ResultOverlay({
  title,
  kind,
  rounds,
  rows,
  winnerJob = null,
  winnerColor = null,
  onRestart,
  onHome,
  homeLabel,
}: ResultOverlayProps) {
  return (
    <div className="result-overlay" role="dialog" aria-label="게임 결과">
      <div className="result-rays" aria-hidden="true" />
      <div
        className="result-card"
        style={{ '--seat-color': winnerColor ?? 'var(--gold)' } as CSSProperties}
      >
        <div className="result-hero">
          {winnerJob ? (
            <JobArt job={winnerJob} className="result-standee" />
          ) : (
            <DragonArt className="result-standee is-draw" />
          )}
          <GameIcon name="crown" className="result-crown" />
        </div>
        <div className="result-banner">
          <span className="result-kind">{kind}</span>
          <h2 className="result-title">{title}</h2>
        </div>
        <p className="muted">{rounds}라운드 만에 게임이 끝났습니다.</p>
        <table className="result-table parchment">
          <thead>
            <tr>
              <th>플레이어</th>
              <th>결과</th>
              <th>
                <GameIcon name="hp" label="HP" />
              </th>
              <th>
                <GameIcon name="atk" label="공격력" />
              </th>
              <th>
                <GameIcon name="def" label="방어력" />
              </th>
              <th>
                <GameIcon name="coins" label="코인" />
              </th>
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
                  <JobArt job={r.job} className="result-job" />
                  <span>
                    <strong>
                      <Crest shape={seatCrest(r.seat)} /> {r.name}
                    </strong>
                    <small>{JOB_LABEL[r.job]}</small>
                  </span>
                </td>
                <td>{r.status}</td>
                <td className="num">{r.alive ? `${r.hp}/${r.maxHp}` : '—'}</td>
                <td className="num">{r.atk}</td>
                <td className="num">{r.def}</td>
                <td className="num">{r.alive ? r.coins : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="result-actions">
          {onRestart && (
            <button type="button" className="btn btn-primary btn-lg" onClick={onRestart}>
              <GameIcon name="restart" /> 다시 하기
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
