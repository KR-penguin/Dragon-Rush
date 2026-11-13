import { ITEM_IDS } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { fxAnchorProps } from '../../types/fxAnchor';
import type { Corner } from '../../types/hudLayout';
import type { IconName } from '../../types/icons';
import { ITEM_LABEL, JOB_LABEL, seatCrest, seatInk } from '../../types/labels';
import type { BadgeKind, PlayerCard } from '../../types/playerView';
import { CountUp } from '../common/CountUp';
import { HpBar } from '../common/HpBar';
import { ItemArt, JobArt } from '../icons/Art';
import { Crest } from '../icons/Crest';
import { GameIcon } from '../icons/GameIcon';

const BADGE_ICON: Record<BadgeKind, IconName> = {
  eliminated: 'skull',
  resting: 'sleep',
  indomitable: 'indomitable',
  ninjaCooldown: 'cooldown',
  rage: 'rage',
  disconnected: 'disconnected',
  botControlled: 'bot',
};

interface CornerCardProps {
  card: PlayerCard;
  corner: Corner;
  /** A bot or remote player is deciding for this seat. */
  thinking: boolean;
  countdown: number | null;
  reduced: boolean;
  /** Targeting: this card can be picked. */
  onPick?: (() => void) | null;
  /** Targeting is on and this card is not a target. */
  dimmed?: boolean;
}

function Stat({
  icon,
  value,
  label,
  reduced,
  anchor,
}: {
  icon: IconName;
  value: number;
  label: string;
  reduced: boolean;
  anchor?: Record<string, string>;
}) {
  return (
    <span className="cc-stat" title={label} {...anchor}>
      <GameIcon name={icon} />
      <CountUp value={value} reduced={reduced} className="impact" />
    </span>
  );
}

/** Corner player card: medallion, name ribbon, HP with ghost drain, stats and item sockets. */
export function CornerCard({
  card,
  corner,
  thinking,
  countdown,
  reduced,
  onPick,
  dimmed,
}: CornerCardProps) {
  const p = card.player;
  const className = [
    'corner-card',
    `corner-${corner}`,
    card.isTurn ? 'is-turn' : '',
    card.isActor ? 'is-actor' : '',
    p.alive ? '' : 'is-out',
    onPick ? 'is-target' : '',
    dimmed ? 'is-dimmed' : '',
  ].join(' ');
  const style = { '--seat-color': card.color, '--seat-ink': seatInk(card.seat) } as CSSProperties;
  const visibleBadges = card.badges.filter((badge) => badge.kind !== 'eliminated');
  const body = (
    <>
      <div className="cc-medallion">
        <JobArt job={p.job} className="cc-portrait" />
        {thinking && (
          <span className="cc-thinking" aria-label="생각 중">
            <i />
            <i />
            <i />
          </span>
        )}
        {!p.alive && (
          <span className="cc-skull">
            <GameIcon name="skull" />
          </span>
        )}
      </div>
      <div className="cc-body">
        <div className="cc-ribbon">
          <Crest shape={seatCrest(card.seat)} className="cc-crest" />
          <strong className="cc-name">{card.name}</strong>
          {card.isTurn && <span className="cc-turn-tag">차례</span>}
          {countdown !== null && card.isActor && (
            <span className="cc-timer num">{countdown}초</span>
          )}
        </div>
        <div className="cc-sub">
          <span>{JOB_LABEL[p.job]}</span>
          {card.kindLabel && <span>· {card.kindLabel}</span>}
        </div>
        {visibleBadges.length > 0 && (
          <div className="cc-badges">
            {visibleBadges.map((b) => (
              <span key={b.kind} className={`cc-badge badge-${b.kind}`} title={b.label}>
                <GameIcon name={BADGE_ICON[b.kind]} label={b.label} />
                {b.kind === 'ninjaCooldown' && <small>보정 {p.passive.ninjaCooldown}턴</small>}
              </span>
            ))}
          </div>
        )}
        <div className="cc-hp">
          <GameIcon name="hp" className="cc-heart" />
          <HpBar
            hp={Math.max(0, p.hp)}
            maxHp={p.maxHp}
            size="md"
            countUp={{ reduced }}
            anchor={{ kind: 'seatHp', id: card.seat }}
          />
        </div>
        <div className="cc-row">
          <Stat icon="atk" value={p.atk} label="공격력" reduced={reduced} />
          <Stat icon="def" value={p.def} label="방어력" reduced={reduced} />
          <Stat
            icon="coins"
            value={p.coins}
            label="코인"
            reduced={reduced}
            anchor={fxAnchorProps({ kind: 'seatCoins', id: card.seat })}
          />
          <span className="cc-sockets">
            {ITEM_IDS.map((item) => {
              const n = p.items[item];
              return (
                <span
                  key={item}
                  className={`cc-socket${n > 0 ? '' : ' is-empty'}`}
                  title={`${ITEM_LABEL[item]} ${n}개`}
                >
                  <ItemArt item={item} className="cc-socket-art" />
                  {n > 1 && <b className="num">{n}</b>}
                </span>
              );
            })}
          </span>
        </div>
      </div>
      {!p.alive && <span className="cc-crack" aria-hidden="true" />}
    </>
  );
  if (onPick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onPick}
        aria-label={`${card.name} 선택`}
        {...fxAnchorProps({ kind: 'seat', id: card.seat })}
      >
        {body}
      </button>
    );
  }
  return (
    <article
      className={className}
      style={style}
      aria-label={`${card.name} (${JOB_LABEL[p.job]})`}
      {...fxAnchorProps({ kind: 'seat', id: card.seat })}
    >
      {body}
    </article>
  );
}
