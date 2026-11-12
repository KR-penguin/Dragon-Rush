import type { ItemId, JobId, TileId } from '@dragon-rush/engine';
import {
  DRAGON_IMAGE_PATH,
  itemImagePath,
  jobImagePath,
  tileImagePath,
} from '../../types/assetPaths';
import { ITEM_ICON_NAME, TILE_ICON_NAME } from '../../types/icons';
import { ITEM_LABEL, JOB_LABEL, TILE_LABEL } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';
import { GameIcon } from './GameIcon';
import { JobPortrait } from './JobPortrait';

// Painted art under public/assets wins; the game-icons SVG is the fallback.

export function JobArt({ job, className = '' }: { job: JobId; className?: string }) {
  return (
    <AssetImage
      className={className}
      path={jobImagePath(job)}
      fallback={<JobPortrait job={job} />}
      alt={JOB_LABEL[job]}
    />
  );
}

export function TileArt({ tileId, className = '' }: { tileId: TileId; className?: string }) {
  return (
    <AssetImage
      className={className}
      path={tileImagePath(tileId)}
      fallback={<GameIcon name={TILE_ICON_NAME[tileId]} />}
      alt={TILE_LABEL[tileId]}
    />
  );
}

export function ItemArt({ item, className = '' }: { item: ItemId; className?: string }) {
  return (
    <AssetImage
      className={className}
      path={itemImagePath(item)}
      fallback={<GameIcon name={ITEM_ICON_NAME[item]} />}
      alt={ITEM_LABEL[item]}
    />
  );
}

export function DragonArt({ className = '' }: { className?: string }) {
  return (
    <AssetImage
      className={className}
      path={DRAGON_IMAGE_PATH}
      fallback={<GameIcon name="dragon" />}
      alt="용"
    />
  );
}
