import type { CombatantRef, JobId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { HIT_BADGE_LABEL, type CombatView, type HitView } from '../../types/combatView';
import { HpBar } from '../common/HpBar';
import { DragonArt, JobArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

export interface FighterLook {
  readonly name: string;
  readonly job: JobId | null;
  readonly color: string;
}

interface CombatOverlayProps {
  view: CombatView;
  lookOf: (ref: CombatantRef) => FighterLook;
  breathEvery: number;
  breathLit: number;
  onSkip: () => void;
}

function FighterCard({
  look,
  hp,
  maxHp,
  lastHit,
  side,
  defeated,
  runes,
}: {
  look: FighterLook;
  hp: number;
  maxHp: number;
  lastHit: HitView | null;
  side: 'left' | 'right';
  defeated: boolean;
  runes: { every: number; lit: number } | null;
}) {
  return (
    <div
      className={`fighter fighter-${side}${defeated ? ' is-defeated' : ''}`}
      style={{ '--seat-color': look.color } as CSSProperties}
    >
      <div key={lastHit?.index ?? -1} className={`fighter-portrait${lastHit ? ' is-hit' : ''}`}>
        {look.job ? <JobArt job={look.job} /> : <DragonArt />}
        {lastHit && (
          <div className="hit-pop">
            <span className={`hit-damage${lastHit.damage === 0 ? ' is-zero' : ''}`}>
              {lastHit.damage === 0 ? '회피' : `-${lastHit.damage}`}
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
      {runes && (
        <span className="fighter-runes" title={`${runes.every}번째 공격마다 브레스`}>
          {Array.from({ length: runes.every }, (_, i) => (
            <span key={i} className={`rune-stone${i < runes.lit ? ' is-lit' : ''}`}>
              <GameIcon name="rune" />
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Dice-resolved fight. Restyled lightly: a real-time canvas combat screen replaces it later. */
export function CombatOverlay({ view, lookOf, breathEvery, breathLit, onSkip }: CombatOverlayProps) {
  const last = view.hits.at(-1) ?? null;
  const a = lookOf(view.a.ref);
  const b = lookOf(view.b.ref);
  const recent = view.hits.slice(-5);
  const runesFor = (ref: CombatantRef) => (ref === 'dragon' ? { every: breathEvery, lit: breathLit } : null);
  return (
    <div className={`combat-overlay combat-${view.kind}`} role="dialog" aria-label="전투">
      <div className="claw-wipe" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="combat-card">
        <h2 className="combat-title">
          <GameIcon name={view.kind === 'dragonFight' ? 'dragon' : 'duel'} />
          {view.kind === 'dragonFight' ? '용과의 전투' : '결투'}
        </h2>
        <div className="combat-stage">
          <FighterCard
            look={a}
            hp={view.a.hp}
            maxHp={view.a.maxHp}
            lastHit={last && last.defender === view.a.ref ? last : null}
            side="left"
            defeated={view.winner !== null && view.winner !== view.a.ref}
            runes={runesFor(view.a.ref)}
          />
          <span className="versus-mark">VS</span>
          <FighterCard
            look={b}
            hp={view.b.hp}
            maxHp={view.b.maxHp}
            lastHit={last && last.defender === view.b.ref ? last : null}
            side="right"
            defeated={view.winner !== null && view.winner !== view.b.ref}
            runes={runesFor(view.b.ref)}
          />
        </div>
        <ol className="combat-log">
          {view.hits.length === 0 && <li className="muted">{lookOf(view.first).name}의 선공!</li>}
          {recent.map((h) => (
            <li key={h.index}>
              <span>
                {lookOf(h.attacker).name} → {lookOf(h.defender).name}
              </span>
              <strong className="impact">{h.damage}</strong>
              <span className="combat-roll">
                <GameIcon name="dice" /> {h.roll}
              </span>
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
            <GameIcon name="crown" /> {lookOf(view.winner).name} 승리!{view.capReached && ' (교환 상한)'}
            {view.eliminated !== null && (
              <span className="combat-out">
                {' '}
                <GameIcon name="skull" /> {lookOf(view.eliminated).name} 탈락
              </span>
            )}
          </div>
        )}
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          <GameIcon name="skip" /> 건너뛰기
        </button>
      </div>
    </div>
  );
}
