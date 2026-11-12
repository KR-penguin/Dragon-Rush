import type { CSSProperties } from 'react';
import { DRAGON_IMAGE_PATH, combatJobImagePath } from '../../types/assetPaths';
import { subtitleOf, type FighterCard } from '../../types/fightView';
import { JOB_LABEL } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';
import { GameIcon } from '../icons/GameIcon';
import { JobPortrait } from '../icons/JobPortrait';

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
            path={combatJobImagePath(card.job)}
            fallback={<JobPortrait job={card.job} />}
            alt={JOB_LABEL[card.job]}
          />
        ) : (
          <AssetImage path={DRAGON_IMAGE_PATH} fallback={<GameIcon name="dragon" />} alt="용" />
        )}
      </div>
      <strong className="fight-portrait-name">{card.name}</strong>
      <span className="fight-portrait-sub">
        {subtitleOf(card)} · HP {card.hp}/{card.maxHp}
      </span>
    </div>
  );
}
