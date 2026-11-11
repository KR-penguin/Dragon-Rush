import type { JobDef, JobId } from '@dragon-rush/engine';
import { jobImagePath } from '../../types/assetPaths';
import { JOB_ICON, JOB_LABEL, JOB_PASSIVE } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';

interface JobCardProps {
  job: JobId;
  stats: JobDef;
  scale: JobDef;
}

function StatRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <div className="stat-track">
        <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/** Job card with base stats (from rules) and the passive one-liner. */
export function JobCard({ job, stats, scale }: JobCardProps) {
  return (
    <div className="job-card">
      <div className="job-card-head">
        <AssetImage
          className="job-card-icon"
          path={jobImagePath(job)}
          fallback={JOB_ICON[job]}
          alt={JOB_LABEL[job]}
        />
        <strong>{JOB_LABEL[job]}</strong>
      </div>
      <StatRow label="HP" value={stats.hp} max={scale.hp} />
      <StatRow label="공격" value={stats.atk} max={scale.atk} />
      <StatRow label="방어" value={stats.def} max={scale.def} />
      <p className="job-passive">{JOB_PASSIVE[job]}</p>
    </div>
  );
}
