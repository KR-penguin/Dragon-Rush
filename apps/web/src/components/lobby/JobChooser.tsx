import { JOB_IDS, type JobId } from '@dragon-rush/engine';
import { JOB_ICON, JOB_LABEL, JOB_PASSIVE } from '../../types/labels';

interface JobChooserProps {
  value: JobId | null;
  taken: readonly JobId[];
  /** Offer "무작위" (no job; the server picks a free one at start). */
  optional: boolean;
  disabled: boolean;
  onChange: (job: JobId | null) => void;
}

/** Five unique jobs; jobs held by other seats are locked. */
export function JobChooser({ value, taken, optional, disabled, onChange }: JobChooserProps) {
  return (
    <div
      className={`job-picker lobby-job-picker${optional ? ' has-random' : ''}`}
      role="radiogroup"
      aria-label="직업 선택"
    >
      {JOB_IDS.map((job) => {
        const isTaken = taken.includes(job);
        return (
          <button
            key={job}
            type="button"
            role="radio"
            aria-checked={value === job}
            className={`job-pick${value === job ? ' is-on' : ''}`}
            disabled={disabled || isTaken}
            title={
              isTaken
                ? `${JOB_LABEL[job]} — 다른 좌석이 선택함`
                : `${JOB_LABEL[job]} — ${JOB_PASSIVE[job]}`
            }
            onClick={() => onChange(job)}
          >
            <span>{JOB_ICON[job]}</span>
            <small>{JOB_LABEL[job]}</small>
          </button>
        );
      })}
      {optional && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className={`job-pick${value === null ? ' is-on' : ''}`}
          disabled={disabled}
          title="시작할 때 남은 직업 중 무작위"
          onClick={() => onChange(null)}
        >
          <span>🎲</span>
          <small>무작위</small>
        </button>
      )}
    </div>
  );
}
