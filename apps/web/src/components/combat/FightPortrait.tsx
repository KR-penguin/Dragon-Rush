import type { CSSProperties } from 'react';
import { DRAGON_IMAGE_PATH, jobImagePath } from '../../types/assetPaths';
import { subtitleOf, type FighterCard } from '../../types/fightView';
import { DRAGON_ICON, JOB_ICON, JOB_LABEL } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';

/** Portrait medal with seat ring, name ribbon and job line (VS splash, result card). */
export function FightPortrait({ card, side }: { card: FighterCard; side: 'left' | 'right' }) {
  return (
    <div
      className={`fight-portrait fight-portrait-${side}`}
      style={{ '--seat': card.color } as CSSProperties}
    >
      <div className="fight-portrait-medal">
        {card.job ? (
          <AssetImage
            path={jobImagePath(card.job)}
            fallback={JOB_ICON[card.job]}
            alt={JOB_LABEL[card.job]}
          />
        ) : (
          <AssetImage path={DRAGON_IMAGE_PATH} fallback={DRAGON_ICON} alt="용" />
        )}
      </div>
      <strong className="fight-portrait-name">{card.name}</strong>
      <span className="fight-portrait-sub">
        {subtitleOf(card)} · HP {card.hp}/{card.maxHp}
      </span>
    </div>
  );
}
