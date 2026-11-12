import { JOB_IDS, type JobId } from '@dragon-rush/engine';
import { JOB_LABEL, JOB_PASSIVE } from '../../types/labels';
import { JobArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

interface JobChooserProps {
  seatNumber: number;
  value: JobId | null;
  taken: readonly JobId[];
  /** Offer "무작위" (no job; the server picks a free one at start). */
  optional: boolean;
  disabled: boolean;
  onChange: (job: JobId | null) => void;
}

/** Five unique jobs (same tokens as the local seat editor); jobs held by other seats are locked. */
export function JobChooser({
  seatNumber,
  value,
  taken,
  optional,
  disabled,
  onChange,
}: JobChooserProps) {
  return (
    <div
      className={`job-picker lobby-job-picker${optional ? ' has-random' : ''}`}
      role="group"
      aria-label={`좌석 ${seatNumber} 직업 선택`}
    >
      {JOB_IDS.map((job) => {
        const isTaken = taken.includes(job);
        return (
          <button
            key={job}
            type="button"
            aria-pressed={value === job}
            className={`job-pick${value === job ? ' is-on' : ''}`}
            disabled={disabled || isTaken}
            title={
              isTaken
                ? `${JOB_LABEL[job]} — 다른 좌석이 선택함`
                : `${JOB_LABEL[job]} — ${JOB_PASSIVE[job]}`
            }
            onClick={() => onChange(job)}
          >
            <JobArt job={job} className="job-pick-art" />
            <small>{JOB_LABEL[job]}</small>
          </button>
        );
      })}
      {optional && (
        <button
          type="button"
          aria-pressed={value === null}
          className={`job-pick${value === null ? ' is-on' : ''}`}
          disabled={disabled}
          title="시작할 때 남은 직업 중 무작위"
          onClick={() => onChange(null)}
        >
          <span className="asset asset-icon job-pick-art" aria-hidden="true">
            <GameIcon name="dice" />
          </span>
          <small>무작위</small>
        </button>
      )}
    </div>
  );
}
