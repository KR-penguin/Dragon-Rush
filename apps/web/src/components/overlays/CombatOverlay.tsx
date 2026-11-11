import type { CombatantRef, JobId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { DRAGON_IMAGE_PATH, jobImagePath } from '../../types/assetPaths';
import { HIT_BADGE_LABEL, type CombatView, type HitView } from '../../types/combatView';
import { DRAGON_ICON, JOB_ICON, JOB_LABEL } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';
import { HpBar } from '../common/HpBar';

export interface FighterLook {
  readonly name: string;
  readonly job: JobId | null;
  readonly color: string;
}

interface CombatOverlayProps {
  view: CombatView;
  lookOf: (ref: CombatantRef) => FighterLook;
  onSkip: () => void;
}

function FighterCard({
  look,
  hp,
  maxHp,
  lastHit,
  side,
  defeated,
}: {
  look: FighterLook;
  hp: number;
  maxHp: number;
  lastHit: HitView | null;
  side: 'left' | 'right';
  defeated: boolean;
}) {
  return (
    <div
      className={`fighter fighter-${side}${defeated ? ' is-defeated' : ''}`}
      style={{ '--seat-color': look.color } as CSSProperties}
    >
      <div key={lastHit?.index ?? -1} className={`fighter-portrait${lastHit ? ' is-hit' : ''}`}>
        {look.job ? (
          <AssetImage
            path={jobImagePath(look.job)}
            fallback={JOB_ICON[look.job]}
            alt={JOB_LABEL[look.job]}
          />
        ) : (
          <AssetImage path={DRAGON_IMAGE_PATH} fallback={DRAGON_ICON} alt="용" />
        )}
        {lastHit && (
          <div className="hit-pop">
            <span className={`hit-damage${lastHit.damage === 0 ? ' is-zero' : ''}`}>
              {lastHit.damage === 0 ? 'MISS' : `-${lastHit.damage}`}
            </span>
            {lastHit.badges.map((b) => (
              <span key={b} className={`hit-badge hit-${b}`}>
                {HIT_BADGE_LABEL[b]}
              </span>
            ))}
          </div>
        )}
      </div>
      <strong className="fighter-name">{look.name}</strong>
      <HpBar hp={hp} maxHp={maxHp} size="lg" />
    </div>
  );
}

export function CombatOverlay({ view, lookOf, onSkip }: CombatOverlayProps) {
  const last = view.hits.at(-1) ?? null;
  const a = lookOf(view.a.ref);
  const b = lookOf(view.b.ref);
  const recent = view.hits.slice(-5);
  return (
    <div className={`combat-overlay combat-${view.kind}`} role="dialog" aria-label="전투">
      <div className="combat-card">
        <h2 className="combat-title">
          {view.kind === 'dragonFight' ? `${DRAGON_ICON} 용과의 전투` : '⚔️ 결투'}
        </h2>
        <div className="combat-stage">
          <FighterCard
            look={a}
            hp={view.a.hp}
            maxHp={view.a.maxHp}
            lastHit={last && last.defender === view.a.ref ? last : null}
            side="left"
            defeated={view.winner !== null && view.winner !== view.a.ref}
          />
          <span className="versus-mark">VS</span>
          <FighterCard
            look={b}
            hp={view.b.hp}
            maxHp={view.b.maxHp}
            lastHit={last && last.defender === view.b.ref ? last : null}
            side="right"
            defeated={view.winner !== null && view.winner !== view.b.ref}
          />
        </div>
        <ol className="combat-log">
          {view.hits.length === 0 && <li className="muted">{lookOf(view.first).name}의 선공!</li>}
          {recent.map((h) => (
            <li key={h.index}>
              <span>
                {lookOf(h.attacker).name} → {lookOf(h.defender).name}
              </span>
              <strong>{h.damage}</strong>
              <span className="muted">🎲{h.roll}</span>
              {h.badges.map((badge) => (
                <span key={badge} className={`hit-badge hit-${badge}`}>
                  {HIT_BADGE_LABEL[badge]}
                </span>
              ))}
            </li>
          ))}
        </ol>
        {view.winner !== null && (
          <div className="combat-result">
            🏆 {lookOf(view.winner).name} 승리!{view.capReached && ' (교환 상한)'}
            {view.eliminated !== null && (
              <span className="combat-out"> 💀 {lookOf(view.eliminated).name} 탈락</span>
            )}
          </div>
        )}
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          ⏭ 건너뛰기
        </button>
      </div>
    </div>
  );
}
