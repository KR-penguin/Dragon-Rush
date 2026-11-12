import type { JobId } from '@dragon-rush/engine';
import { jobImagePath } from '../../types/assetPaths';
import { JOB_ICON, JOB_LABEL, JOB_PASSIVE } from '../../types/labels';
import type { SeatChoice, SeatChoiceGroup, SeatView } from '../../types/onlineLobby';
import { AssetImage } from '../common/AssetImage';
import { JobChooser } from './JobChooser';

interface SeatCardProps {
  seat: SeatView;
  groups: readonly SeatChoiceGroup[];
  /** Controls are locked while disconnected. */
  disabled: boolean;
  onConfigure: (choice: SeatChoice) => void;
  onSelectJob: (job: JobId | null) => void;
}

/** One lobby seat: who sits here, their job and ready state, plus host / own-seat controls. */
export function SeatCard({ seat, groups, disabled, onConfigure, onSelectJob }: SeatCardProps) {
  const classes = ['lobby-seat', `tone-${seat.tone}`];
  if (seat.isMe) classes.push('is-me');
  const showPresence = seat.kind === 'human' && seat.occupied;

  return (
    <section className={classes.join(' ')} aria-label={`좌석 ${seat.seat + 1}`}>
      <header className="lobby-seat-head">
        <span className="lobby-seat-no">좌석 {seat.seat + 1}</span>
        {seat.isHost && (
          <span className="lobby-crown" title="방장" aria-label="방장">
            👑
          </span>
        )}
        {seat.isMe && <span className="lobby-me">나</span>}
        <span className={`lobby-pill tone-${seat.tone}`}>{seat.statusLabel}</span>
      </header>

      <div className="lobby-seat-who">
        <div className="lobby-seat-avatar">
          {seat.job ? (
            <AssetImage
              path={jobImagePath(seat.job)}
              fallback={JOB_ICON[seat.job]}
              alt={JOB_LABEL[seat.job]}
            />
          ) : (
            <span aria-hidden="true">{seat.kindIcon}</span>
          )}
        </div>
        <div className="lobby-seat-id">
          <strong className="lobby-seat-name" title={seat.title}>
            {seat.title}
          </strong>
          <small className="lobby-seat-kind">
            {seat.kindIcon} {seat.kindLabel}
            {showPresence && (
              <span className={`lobby-presence${seat.connected ? ' is-on' : ''}`}>
                {seat.connected ? '접속 중' : '접속 끊김'}
              </span>
            )}
          </small>
        </div>
      </div>

      {seat.job ? (
        <div className="lobby-seat-job">
          <strong>
            {JOB_ICON[seat.job]} {JOB_LABEL[seat.job]}
          </strong>
          <small>{JOB_PASSIVE[seat.job]}</small>
        </div>
      ) : (
        seat.jobHint !== '' && (
          <div className="lobby-seat-job is-empty">
            <small>{seat.jobHint}</small>
          </div>
        )
      )}

      {seat.configurable && (
        <label className="field lobby-seat-config">
          <span>좌석 설정</span>
          <select
            value={seat.choice}
            disabled={disabled}
            onChange={(e) => onConfigure(e.target.value)}
          >
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {seat.jobEditable && (
        <JobChooser
          value={seat.job}
          taken={seat.takenJobs}
          optional={seat.jobOptional}
          disabled={disabled}
          onChange={onSelectJob}
        />
      )}
    </section>
  );
}
