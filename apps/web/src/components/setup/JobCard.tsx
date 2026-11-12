import type { JobDef, JobId } from '@dragon-rush/engine';
import type { IconName } from '../../types/icons';
import { JOB_LABEL, JOB_PASSIVE } from '../../types/labels';
import { JobArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

interface JobCardProps {
  job: JobId;
  stats: JobDef;
  scale: JobDef;
}

function StatRow({ icon, label, value, max }: { icon: IconName; label: string; value: number; max: number }) {
  return (
    <div className="stat-row">
      <span className="stat-label">
        <GameIcon name={icon} /> {label}
      </span>
      <div className="stat-track">
        <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="stat-value impact">{value}</span>
    </div>
  );
}

/** Job card with base stats (from rules) and the passive one-liner. */
export function JobCard({ job, stats, scale }: JobCardProps) {
  return (
    <div className="job-card parchment">
      <div className="job-card-head">
        <JobArt job={job} className="job-card-icon" />
        <strong>{JOB_LABEL[job]}</strong>
      </div>
      <StatRow icon="hp" label="HP" value={stats.hp} max={scale.hp} />
      <StatRow icon="atk" label="공격" value={stats.atk} max={scale.atk} />
      <StatRow icon="def" label="방어" value={stats.def} max={scale.def} />
      <p className="job-passive">{JOB_PASSIVE[job]}</p>
    </div>
  );
}
