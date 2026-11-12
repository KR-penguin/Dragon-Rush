import type { TileDef } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import type { TileSide } from '../../types/boardGeometry';
import { fxAnchorProps } from '../../types/fxAnchor';
import { TILE_LABEL } from '../../types/labels';
import {
  CATEGORY_LABEL,
  landmarkOf,
  signed,
  type EffectChip,
  type TileCategory,
} from '../../types/tileView';
import { GameIcon } from '../icons/GameIcon';
import { TileArt } from '../icons/Art';
import { Landmark } from './Landmark';

export interface TileFlags {
  readonly target: boolean;
  readonly preview: boolean;
  readonly active: boolean;
  readonly flash: boolean;
}

interface BoardTileProps {
  index: number;
  tile: TileDef;
  category: TileCategory;
  chips: readonly EffectChip[];
  side: TileSide;
  row: number;
  col: number;
  flags: TileFlags;
  onPick?: () => void;
  onHover?: (index: number | null, el: HTMLElement | null) => void;
}

export function EffectChips({
  chips,
  className = '',
}: {
  chips: readonly EffectChip[];
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <span className={`effect-chips ${className}`}>
      {chips.map((c, i) => (
        <span key={i} className={`effect-chip chip-${c.tone}`} title={c.label}>
          <GameIcon name={c.icon} />
          {c.amount !== null && <b>{signed(c.amount)}</b>}
        </span>
      ))}
    </span>
  );
}

/** Parchment plaque with a category gem and effect chips; corners carry a landmark standee. */
export function BoardTile({
  index,
  tile,
  category,
  chips,
  side,
  row,
  col,
  flags,
  onPick,
  onHover,
}: BoardTileProps) {
  const name = TILE_LABEL[tile.id];
  const landmark = side === 'corner' ? landmarkOf(tile.id) : null;
  const className = [
    'tile',
    `tile-${side}`,
    `cat-${category}`,
    flags.target ? 'is-target' : '',
    flags.preview ? 'is-preview' : '',
    flags.active ? 'is-active' : '',
    flags.flash ? 'is-flash' : '',
  ].join(' ');
  const style: CSSProperties = { gridRow: row + 1, gridColumn: col + 1 };
  const hover = {
    onPointerEnter: (e: { currentTarget: HTMLElement }) => onHover?.(index, e.currentTarget),
    onPointerLeave: (e: { currentTarget: HTMLElement; pointerType: string }) => {
      if (e.pointerType === 'touch') return;
      const el = e.currentTarget;
      onHover?.(el.matches(':focus') ? index : null, el.matches(':focus') ? el : null);
    },
    onPointerDown: (e: { currentTarget: HTMLElement; pointerType: string }) => {
      if (e.pointerType === 'touch') onHover?.(index, e.currentTarget);
    },
    onFocus: (e: { currentTarget: HTMLElement }) => onHover?.(index, e.currentTarget),
    onBlur: (e: { currentTarget: HTMLElement }) => {
      const el = e.currentTarget;
      onHover?.(el.matches(':hover') ? index : null, el.matches(':hover') ? el : null);
    },
  };
  const descriptionId = `tile-tooltip-${index}`;
  const body = (
    <>
      <span className="tile-face parchment">
        <span className={`tile-gem gem-${category}`} title={CATEGORY_LABEL[category]} />
        {!landmark && <TileArt tileId={tile.id} className="tile-icon" />}
        <span className="tile-name">{name}</span>
        <EffectChips chips={chips} className="tile-chips" />
        <span className="tile-glow" />
      </span>
      {landmark && <Landmark kind={landmark} tileId={tile.id} />}
    </>
  );
  if (flags.target && onPick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onPick}
        aria-label={`${name}까지 시계 방향으로 텔레포트 이동`}
        aria-describedby={descriptionId}
        {...fxAnchorProps({ kind: 'tile', id: index })}
        {...hover}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      className={className}
      style={style}
      role="group"
      tabIndex={0}
      aria-label={`${index}번 칸 ${name}`}
      aria-describedby={descriptionId}
      {...fxAnchorProps({ kind: 'tile', id: index })}
      {...hover}
    >
      {body}
    </div>
  );
}
