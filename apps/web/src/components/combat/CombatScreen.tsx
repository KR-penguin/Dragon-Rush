import type { CombatResult } from '@dragon-rush/combat';
import type { ReactNode, RefObject } from 'react';
import type { FightPhase } from '../../combat/fightFlow';
import type { FighterCard } from '../../types/fightView';
import { FightGo, FightIntro, FightPaused, FightReady, FightResultCard } from './FightOverlays';
import type { TouchTracker } from '../../services/fight/touchInput';
import { TouchControls } from './TouchControls';
import { GameIcon } from '../icons/GameIcon';

interface CombatScreenProps {
  cards: readonly [FighterCard, FighterCard];
  phase: FightPhase;
  result: CombatResult | null;
  go: boolean;
  /** Null for live fights; bot-only replays show their playback speed. */
  replaySpeed: number | null;
  paused: boolean;
  pointerCapable: boolean;
  online: boolean;
  touchTracker: TouchTracker | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  onSkip: (() => void) | null;
  onResume: () => void;
  onPause: () => void;
  onOpenControls: () => void;
  /** The controls help, rendered inside the screen so it stacks above the arena. */
  children?: ReactNode;
}

/** Full-screen fight: the Canvas arena plus the DOM transition layers above it. */
export function CombatScreen(p: CombatScreenProps) {
  const dragon = p.cards[1].seat === null;
  return (
    <div
      className={`combat-screen${dragon ? ' is-dragon' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="전투"
    >
      <div className="combat-stage" ref={p.stageRef}>
        <canvas ref={p.canvasRef} className="combat-canvas" style={{ touchAction: 'none' }} />
        {p.phase === 'intro' && <FightIntro cards={p.cards} replaySpeed={p.replaySpeed} />}
        {p.phase === 'ready' && <FightReady cards={p.cards} />}
        {p.go && <FightGo />}
        {p.phase === 'result' && p.result && <FightResultCard cards={p.cards} result={p.result} />}
        {p.paused && <FightPaused onResume={p.onResume} online={p.online} />}
        {p.touchTracker && <TouchControls tracker={p.touchTracker} onPause={p.onPause} />}
        {p.replaySpeed !== null && p.phase === 'fight' && (
          <div className="combat-badge">봇 전투 ×{p.replaySpeed}</div>
        )}
      </div>
      <div className="combat-bar">
        {p.onSkip ? (
          <button type="button" className="btn btn-ghost" onClick={p.onSkip}>
            <GameIcon name="skip" /> 건너뛰기
          </button>
        ) : (
          <span className="combat-hint">
            {p.pointerCapable ? '경기장 왼쪽 클릭·터치 공격 · Esc 일시 정지' : 'Esc 일시 정지'}
          </span>
        )}
        <button type="button" className="btn btn-ghost" onClick={p.onOpenControls}>
          조작법
        </button>
      </div>
      {p.children}
    </div>
  );
}
