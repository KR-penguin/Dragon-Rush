import type { ReactNode } from 'react';
import { DRAGON_IMAGE_PATH } from '../../types/assetPaths';
import { DRAGON_ICON } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';
import { DiceFace } from './DiceFace';

interface DragonLairProps {
  dragon: { readonly hp: number; readonly atk: number; readonly def: number };
  round: number;
  maxRounds: number | null;
  dice: { readonly value: number | null; readonly rolling: boolean };
  decision: string;
  countdown: number | null;
  children?: ReactNode;
}

/** Board centre: the dragon, round, last dice and who is deciding. */
export function DragonLair({
  dragon,
  round,
  maxRounds,
  dice,
  decision,
  countdown,
  children,
}: DragonLairProps) {
  return (
    <div className="lair">
      <div className="lair-title">용의 둥지</div>
      <AssetImage
        className="lair-dragon"
        path={DRAGON_IMAGE_PATH}
        fallback={DRAGON_ICON}
        alt="용"
      />
      <div className="lair-stats">
        <span title="체력">❤️ {dragon.hp}</span>
        <span title="공격력">⚔️ {dragon.atk}</span>
        <span title="방어력">🛡️ {dragon.def}</span>
      </div>
      <div className="lair-row">
        <div className="lair-round">
          <span className="lair-label">라운드</span>
          <strong>
            {round}
            {maxRounds !== null && <small> / {maxRounds}</small>}
          </strong>
        </div>
        <DiceFace value={dice.value} rolling={dice.rolling} />
      </div>
      <div className="lair-decision">
        {decision}
        {countdown !== null && <span className="lair-countdown"> · {countdown}초</span>}
      </div>
      {children}
    </div>
  );
}
