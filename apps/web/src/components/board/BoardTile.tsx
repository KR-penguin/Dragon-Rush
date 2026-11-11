import type { TileDef } from '@dragon-rush/engine';
import { tileImagePath } from '../../types/assetPaths';
import { TILE_ICON, TILE_LABEL } from '../../types/labels';
import type { TileTone } from '../../types/tileView';
import { AssetImage } from '../common/AssetImage';

interface BoardTileProps {
  index: number;
  tile: TileDef;
  tone: TileTone;
  row: number;
  col: number;
  highlighted: boolean;
  active: boolean;
  onPick?: () => void;
}

export function BoardTile({
  index,
  tile,
  tone,
  row,
  col,
  highlighted,
  active,
  onPick,
}: BoardTileProps) {
  const name = TILE_LABEL[tile.id];
  const className = `tile tile-${tone}${highlighted ? ' tile-target' : ''}${active ? ' tile-active' : ''}`;
  const style = { gridRow: row + 1, gridColumn: col + 1 };
  const body = (
    <>
      <span className="tile-index">{index}</span>
      <AssetImage
        className="tile-icon"
        path={tileImagePath(tile.id)}
        fallback={TILE_ICON[tile.id]}
        alt={name}
      />
      <span className="tile-name">{name}</span>
    </>
  );
  if (highlighted && onPick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onPick}
        title={`${name}(으)로 텔레포트`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={className} style={style} title={name}>
      {body}
    </div>
  );
}
