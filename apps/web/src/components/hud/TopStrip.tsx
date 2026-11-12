import type { JobId, SeatId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import type { AnimationSpeed } from '../../store/gameStore';
import { seatCrest } from '../../types/labels';
import { JobArt } from '../icons/Art';
import { Crest } from '../icons/Crest';
import { GameIcon } from '../icons/GameIcon';

const SPEEDS: readonly AnimationSpeed[] = [1, 2, 4];

export interface TurnCoin {
  readonly seat: SeatId;
  readonly name: string;
  readonly job: JobId;
  readonly color: string;
  readonly alive: boolean;
  readonly active: boolean;
}

interface TopStripProps {
  order: readonly TurnCoin[];
  round: number;
  maxRounds: number | null;
  breathEvery: number;
  breathLit: number;
  speed: AnimationSpeed;
  canSkip: boolean;
  muted: boolean;
  reduced: boolean;
  onSpeed: (speed: AnimationSpeed) => void;
  onSkip: () => void;
  onToggleMute: () => void;
  onToggleMotion: () => void;
  onChronicle: () => void;
  onSettings: () => void;
  onExit: () => void;
}

/** Turn-order coins, the stone round dial, breath runes and the table controls. */
export function TopStrip(props: TopStripProps) {
  return (
    <header className="top-strip">
      <ol className="turn-coins" aria-label="턴 순서">
        {props.order.map((c) => (
          <li
            key={c.seat}
            className={`turn-coin${c.active ? ' is-active' : ''}${c.alive ? '' : ' is-out'}`}
            style={{ '--seat-color': c.color } as CSSProperties}
            title={c.name}
          >
            <JobArt job={c.job} className="turn-coin-art" />
            <Crest shape={seatCrest(c.seat)} className="turn-coin-crest" />
            {!c.alive && <GameIcon name="skull" className="turn-coin-skull" />}
          </li>
        ))}
      </ol>

      <div className="round-dial" aria-label={`${props.round}라운드`}>
        <span className="round-dial-label">라운드</span>
        <strong className="impact">{props.round}</strong>
        {props.maxRounds !== null && <small className="num">/ {props.maxRounds}</small>}
      </div>

      <div className="strip-runes" title={`용의 브레스: ${props.breathEvery}번째 공격마다 방어 무시`}>
        {Array.from({ length: props.breathEvery }, (_, i) => (
          <span key={i} className={`rune-stone${i < props.breathLit ? ' is-lit' : ''}`}>
            <GameIcon name="rune" />
          </span>
        ))}
      </div>

      <div className="strip-controls">
        <div className="segmented" role="group" aria-label="연출 속도">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={s === props.speed ? 'is-on' : undefined}
              aria-pressed={s === props.speed}
              onClick={() => props.onSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          disabled={!props.canSkip}
          onClick={props.onSkip}
          aria-label="연출 건너뛰기"
          title="연출 건너뛰기"
        >
          <GameIcon name="skip" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={props.onToggleMute}
          aria-label={props.muted ? '소리 켜기' : '소리 끄기'}
          title={props.muted ? '소리 켜기' : '소리 끄기'}
        >
          <GameIcon name={props.muted ? 'soundOff' : 'soundOn'} />
        </button>
        <button
          type="button"
          className={`icon-btn${props.reduced ? ' is-on' : ''}`}
          onClick={props.onToggleMotion}
          aria-pressed={props.reduced}
          aria-label="움직임 줄이기"
          title={props.reduced ? '움직임 줄이기: 켜짐' : '움직임 줄이기: 꺼짐'}
        >
          <GameIcon name="motion" />
        </button>
        <button type="button" className="icon-btn" onClick={props.onChronicle} aria-label="연대기" title="연대기 (게임 기록)">
          <GameIcon name="chronicle" />
        </button>
        <button type="button" className="icon-btn" onClick={props.onSettings} aria-label="연출 · 사운드 설정" title="연출 · 사운드 설정">
          <GameIcon name="settings" />
        </button>
        <button type="button" className="icon-btn" onClick={props.onExit} aria-label="나가기" title="나가기">
          <GameIcon name="exit" />
        </button>
      </div>
    </header>
  );
}
