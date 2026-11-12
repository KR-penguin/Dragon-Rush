import type { FightBotLevel } from '../../services/gameClient';

const LEVELS: readonly { id: FightBotLevel; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];

interface CombatOptionsFieldProps {
  fastCombat: boolean;
  botLevel: FightBotLevel;
  onFastCombat: (on: boolean) => void;
  onBotLevel: (level: FightBotLevel) => void;
  onOpenControls: () => void;
}

/** Setup options: real-time vs dice fights, combat bot strength, and the controls help. */
export function CombatOptionsField({
  fastCombat,
  botLevel,
  onFastCombat,
  onBotLevel,
  onOpenControls,
}: CombatOptionsFieldProps) {
  return (
    <>
      <div className="field">
        <span>전투 방식</span>
        <div className="segmented" role="group" aria-label="전투 방식">
          <button
            type="button"
            className={!fastCombat ? 'is-on' : undefined}
            aria-pressed={!fastCombat}
            onClick={() => onFastCombat(false)}
          >
            실시간 전투
          </button>
          <button
            type="button"
            className={fastCombat ? 'is-on' : undefined}
            aria-pressed={fastCombat}
            onClick={() => onFastCombat(true)}
          >
            빠른 전투: 주사위 판정
          </button>
        </div>
      </div>
      {!fastCombat && (
        <div className="field">
          <span>전투 봇 난이도</span>
          <div className="segmented" role="group" aria-label="전투 봇 난이도">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={botLevel === l.id ? 'is-on' : undefined}
                aria-pressed={botLevel === l.id}
                onClick={() => onBotLevel(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="btn btn-ghost" onClick={onOpenControls}>
        조작법
      </button>
    </>
  );
}
