import type { TileDef } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { TILE_FLAVOR, TILE_LABEL } from '../../types/labels';
import {
  CATEGORY_LABEL,
  effectChips,
  effectSummary,
  tileCategory,
} from '../../types/tileView';
import { TileArt } from '../icons/Art';
import { EffectChips } from './BoardTile';

export interface TileHover {
  readonly index: number;
  /** Screen rect of the (projected) tile. */
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

interface TileTooltipProps {
  hover: TileHover | null;
  tiles: readonly TileDef[];
  /** Names of the players standing on the hovered tile. */
  occupants: readonly string[];
}

/** Screen-space card with the full name, effect and index of the hovered tile (never tilted). */
export function TileTooltip({ hover, tiles, occupants }: TileTooltipProps) {
  if (!hover) return null;
  const tile = tiles[hover.index];
  if (!tile) return null;
  const category = tileCategory(tile, hover.index);
  const below = hover.rect.top < 220;
  const style = {
    left: hover.rect.left + hover.rect.width / 2,
    top: below ? hover.rect.top + hover.rect.height + 10 : hover.rect.top - 10,
  } as CSSProperties;
  return (
    <div className={`tile-tooltip parchment${below ? ' is-below' : ''}`} style={style} role="tooltip">
      <div className="tile-tooltip-head">
        <TileArt tileId={tile.id} className="tile-tooltip-icon" />
        <div>
          <strong>{TILE_LABEL[tile.id]}</strong>
          <small>
            <span className={`tile-gem gem-${category}`} /> {CATEGORY_LABEL[category]} · {hover.index}번 칸
            {tile.safe && ' · 안전 지대'}
          </small>
        </div>
      </div>
      <EffectChips chips={effectChips(tile.effects)} />
      <p className="tile-tooltip-effect">{effectSummary(tile.effects)}</p>
      <p className="tile-tooltip-flavor">{TILE_FLAVOR[tile.id]}</p>
      {occupants.length > 0 && <p className="tile-tooltip-who">여기 있음: {occupants.join(', ')}</p>}
    </div>
  );
}
