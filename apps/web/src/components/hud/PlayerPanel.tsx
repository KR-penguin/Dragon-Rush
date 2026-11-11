import { ITEM_IDS } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { jobImagePath } from '../../types/assetPaths';
import { COIN_ICON, ITEM_ICON, ITEM_LABEL, JOB_ICON, JOB_LABEL } from '../../types/labels';
import type { PlayerCard } from '../../types/playerView';
import { AssetImage } from '../common/AssetImage';
import { Badges } from '../common/Badges';
import { HpBar } from '../common/HpBar';

export function PlayerPanel({ card }: { card: PlayerCard }) {
  const p = card.player;
  const className = [
    'player-panel',
    card.isTurn ? 'is-turn' : '',
    card.isActor ? 'is-actor' : '',
    p.alive ? '' : 'is-out',
  ].join(' ');
  return (
    <article className={className} style={{ '--seat-color': card.color } as CSSProperties}>
      <header className="pp-head">
        <AssetImage
          className="pp-job"
          path={jobImagePath(p.job)}
          fallback={JOB_ICON[p.job]}
          alt={JOB_LABEL[p.job]}
        />
        <div className="pp-title">
          <strong className="pp-name">{card.name}</strong>
          <span className="pp-sub">
            {JOB_LABEL[p.job]} · {card.kindLabel}
          </span>
        </div>
        {card.isActor && (
          <span className="pp-turn" title="결정 중">
            ▶
          </span>
        )}
      </header>
      <HpBar hp={p.hp} maxHp={p.maxHp} size="sm" />
      <div className="pp-stats">
        <span title="공격력">⚔️ {p.atk}</span>
        <span title="방어력">🛡️ {p.def}</span>
        <span title="코인" className="pp-coins">
          {COIN_ICON} {p.coins}
        </span>
      </div>
      <div className="pp-items">
        {ITEM_IDS.map((item) => (
          <span
            key={item}
            className={p.items[item] > 0 ? 'pp-item' : 'pp-item is-empty'}
            title={ITEM_LABEL[item]}
          >
            {ITEM_ICON[item]} {p.items[item]}
          </span>
        ))}
      </div>
      <Badges badges={card.badges} />
    </article>
  );
}
