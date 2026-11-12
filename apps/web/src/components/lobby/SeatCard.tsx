import type { JobId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { JOB_LABEL, JOB_PASSIVE, seatColor, seatCrest, seatInk } from '../../types/labels';
import type { SeatChoice, SeatChoiceGroup, SeatView } from '../../types/onlineLobby';
import { JobArt } from '../icons/Art';
import { Crest } from '../icons/Crest';
import { GameIcon } from '../icons/GameIcon';
import { JobChooser } from './JobChooser';

interface SeatCardProps {
  seat: SeatView;
  groups: readonly SeatChoiceGroup[];
  /** Controls are locked while disconnected. */
  disabled: boolean;
  onConfigure: (choice: SeatChoice) => void;
  onSelectJob: (job: JobId | null) => void;
}

/** One lobby seat: portrait medallion, seat ribbon and crest, status badges, then host / own-seat controls. */
export function SeatCard({ seat, groups, disabled, onConfigure, onSelectJob }: SeatCardProps) {
  const classes = ['lobby-seat', `tone-${seat.tone}`];
  if (seat.isMe) classes.push('is-me');
  const showPresence = seat.kind === 'human' && seat.occupied;
  const style = {
    '--seat-color': seatColor(seat.seat),
    '--seat-ink': seatInk(seat.seat),
  } as CSSProperties;

  return (
    <section className={classes.join(' ')} style={style} aria-label={`좌석 ${seat.seat + 1}`}>
      <header className="lobby-seat-head">
        <div className="lobby-medallion" aria-hidden="true">
          {seat.job ? (
            <JobArt job={seat.job} className="lobby-portrait" />
          ) : (
            <GameIcon name={seat.kindIcon} className="lobby-portrait" />
          )}
          {seat.isHost && (
            <span className="lobby-medal-crown">
              <GameIcon name="crown" />
            </span>
          )}
        </div>
        <div className="lobby-seat-id">
          <span className="lobby-seat-no">
            좌석 {seat.seat + 1}
            {seat.isMe && <span className="lobby-me">나</span>}
          </span>
          <div className="lobby-ribbon">
            <Crest shape={seatCrest(seat.seat)} className="lobby-crest" />
            <strong className="lobby-seat-name" title={seat.title}>
              {seat.title}
            </strong>
          </div>
          <small className="lobby-seat-kind">
            <GameIcon name={seat.kindIcon} /> {seat.kindLabel}
          </small>
        </div>
      </header>

      <div className="lobby-badges">
        <span className={`lobby-badge tone-${seat.tone}`}>
          <GameIcon name={seat.statusIcon} /> {seat.statusLabel}
        </span>
        {showPresence && (
          <span className={`lobby-badge lobby-presence${seat.connected ? ' is-on' : ''}`}>
            <GameIcon name={seat.connected ? 'online' : 'disconnected'} />{' '}
            {seat.connected ? '접속 중' : '접속 끊김'}
          </span>
        )}
      </div>

      {seat.job ? (
        <div className="lobby-seat-job parchment">
          <strong>{JOB_LABEL[seat.job]}</strong>
          <small>{JOB_PASSIVE[seat.job]}</small>
        </div>
      ) : (
        seat.jobHint !== '' && (
          <div className="lobby-seat-job is-empty">
            <GameIcon name={seat.jobOptional ? 'dice' : 'scroll'} />
            <small>{seat.jobHint}</small>
          </div>
        )
      )}

      {seat.configurable && (
        <label className="field lobby-seat-config">
          <span>
            <GameIcon name="settings" /> 좌석 설정
          </span>
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
          seatNumber={seat.seat + 1}
          value={seat.job}
          optional={seat.jobOptional}
          disabled={disabled}
          onChange={onSelectJob}
        />
      )}
    </section>
  );
}
