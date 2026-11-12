import { DEFAULT_RULES } from '@dragon-rush/engine';
import { GameIcon } from '../components/icons/GameIcon';
import { SeatEditor } from '../components/setup/SeatEditor';
import { useLocalSetup } from '../hooks/useLocalSetup';
import { CombatOptions } from './setup/CombatOptions';
import {
  jobStatScale,
  MAX_ROUND_OPTIONS,
  MAX_SEATS,
  MIN_SEATS,
  takenJobs,
} from '../types/setupForm';

const JOB_SCALE = jobStatScale(DEFAULT_RULES.jobs);

interface LocalSetupPageProps {
  onBack: () => void;
}

export function LocalSetupPage({ onBack }: LocalSetupPageProps) {
  const setup = useLocalSetup();
  const { form, errors } = setup;
  return (
    <main className="setup">
      <header className="page-head">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← 처음으로
        </button>
        <div className="page-title">
          <span className="page-kicker">작전 탁자에 둘러앉기</span>
          <h1>로컬 게임 준비</h1>
        </div>
      </header>

      <section className="panel setup-options">
        <div className="field">
          <span>인원</span>
          <div className="segmented" role="group" aria-label="인원">
            {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i).map((n) => (
              <button
                key={n}
                type="button"
                className={form.seats.length === n ? 'is-on' : undefined}
                aria-pressed={form.seats.length === n}
                onClick={() => setup.setSeatCount(n)}
              >
                {n}명
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>최대 라운드</span>
          <div className="segmented" role="group" aria-label="최대 라운드">
            {MAX_ROUND_OPTIONS.map((r) => (
              <button
                key={r ?? 'none'}
                type="button"
                className={form.maxRounds === r ? 'is-on' : undefined}
                aria-pressed={form.maxRounds === r}
                onClick={() => setup.setMaxRounds(r)}
              >
                {r === null ? '없음' : `${r}`}
              </button>
            ))}
          </div>
        </div>
        <CombatOptions />
        <p className="muted setup-note">턴 순서는 게임을 시작할 때 무작위로 정해집니다.</p>
      </section>

      <div className="seat-grid">
        {form.seats.map((seat, i) => (
          <SeatEditor
            key={i}
            index={i}
            seat={seat}
            taken={takenJobs(form, i)}
            jobs={DEFAULT_RULES.jobs}
            scale={JOB_SCALE}
            onChange={(patch) => setup.updateSeat(i, patch)}
          />
        ))}
      </div>

      <footer className="setup-footer">
        {errors.length > 0 && (
          <ul className="form-errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={errors.length > 0}
          onClick={setup.start}
        >
          <GameIcon name="duel" /> 게임 시작
        </button>
      </footer>
    </main>
  );
}
