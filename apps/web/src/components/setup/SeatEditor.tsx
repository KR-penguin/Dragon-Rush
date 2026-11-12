import { JOB_IDS, type JobDef, type JobId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { JOB_LABEL, seatColor, seatCrest } from '../../types/labels';
import { JobArt } from '../icons/Art';
import { Crest } from '../icons/Crest';
import {
  BOT_OPTIONS,
  type BotOptionId,
  type SeatForm,
  type SeatKindChoice,
} from '../../types/setupForm';
import { JobCard } from './JobCard';
import { BOT_STYLE_HELP } from './botStyleHelp';

interface SeatEditorProps {
  index: number;
  seat: SeatForm;
  jobs: Readonly<Record<JobId, JobDef>>;
  scale: JobDef;
  onChange: (patch: Partial<SeatForm>) => void;
}

const isKind = (v: string): v is SeatKindChoice => v === 'human' || v === 'bot' || v === 'model';
const isBot = (v: string): v is BotOptionId => BOT_OPTIONS.some((o) => o.id === v);

export function SeatEditor({ index, seat, jobs, scale, onChange }: SeatEditorProps) {
  const id = `seat-${index}`;
  return (
    <section className="seat-editor" style={{ '--seat-color': seatColor(index) } as CSSProperties}>
      <header className="seat-editor-head">
        <Crest shape={seatCrest(index)} className="seat-crest" />
        <span>좌석 {index + 1}</span>
      </header>
      <label className="field">
        <span>이름</span>
        <input
          id={`${id}-name`}
          value={seat.name}
          maxLength={12}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="이름"
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>종류</span>
          <select
            value={seat.kind}
            onChange={(e) => {
              if (isKind(e.target.value)) onChange({ kind: e.target.value });
            }}
          >
            <option value="human">사람</option>
            <option value="bot">봇</option>
            <option value="model" disabled title="준비 중">
              모델 (준비 중)
            </option>
          </select>
        </label>
        {seat.kind === 'bot' && (
          <label className="field">
            <span>봇 스타일</span>
            <select
              value={seat.bot}
              aria-describedby={`${id}-bot-help`}
              onChange={(e) => {
                if (isBot(e.target.value)) onChange({ bot: e.target.value });
              }}
            >
              {BOT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {seat.kind === 'bot' && (
        <p id={`${id}-bot-help`} className="setup-bot-help" aria-live="polite">
          {BOT_STYLE_HELP[seat.bot]}
        </p>
      )}
      <div className="job-picker" role="radiogroup" aria-label="직업">
        {JOB_IDS.map((job) => {
          return (
            <button
              key={job}
              type="button"
              role="radio"
              aria-checked={seat.job === job}
              className={`job-pick${seat.job === job ? ' is-on' : ''}`}
              title={JOB_LABEL[job]}
              onClick={() => onChange({ job })}
            >
              <JobArt job={job} className="job-pick-art" />
              <small>{JOB_LABEL[job]}</small>
            </button>
          );
        })}
      </div>
      <JobCard job={seat.job} stats={jobs[seat.job]} scale={scale} />
    </section>
  );
}
