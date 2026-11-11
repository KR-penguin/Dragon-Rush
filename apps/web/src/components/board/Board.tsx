import type { JobId, SeatId, TileDef } from '@hero-dice/engine';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { jobImagePath } from '../../types/assetPaths';
import { RING_SIDE, ringCell, slotOffset, tokenSlots } from '../../types/boardLayout';
import { JOB_ICON, JOB_LABEL } from '../../types/labels';
import { tileTone } from '../../types/tileView';
import { AssetImage } from '../common/AssetImage';
import { BoardTile } from './BoardTile';

export interface TokenView {
  readonly seat: SeatId;
  readonly tile: number;
  readonly color: string;
  readonly job: JobId;
  readonly name: string;
  readonly active: boolean;
}

interface BoardProps {
  tiles: readonly TileDef[];
  tokens: readonly TokenView[];
  /** Tiles that can be picked right now (teleport destinations), or null. */
  targets: ReadonlySet<number> | null;
  activeTile: number | null;
  backgroundUrl: string | null;
  onPickTile?: (tile: number) => void;
  children?: ReactNode;
}

export function Board({
  tiles,
  tokens,
  targets,
  activeTile,
  backgroundUrl,
  onPickTile,
  children,
}: BoardProps) {
  const slots = useMemo(() => tokenSlots(tokens), [tokens]);
  return (
    <div
      className={`board${targets ? ' board-picking' : ''}`}
      style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
    >
      <div className="board-grid">
        {tiles.map((tile, index) => {
          const cell = ringCell(index);
          const highlighted = targets?.has(index) ?? false;
          return (
            <BoardTile
              key={index}
              index={index}
              tile={tile}
              tone={tileTone(tile)}
              row={cell.row}
              col={cell.col}
              highlighted={highlighted}
              active={activeTile === index}
              {...(onPickTile ? { onPick: () => onPickTile(index) } : {})}
            />
          );
        })}
        <div className="board-center">{children}</div>
      </div>
      <div className="token-layer" aria-hidden="true">
        {tokens.map((t) => {
          const slot = slots.get(t.seat);
          if (!slot) return null;
          const cell = ringCell(slot.tile);
          const off = slotOffset(slot.slot, slot.count);
          const style = {
            left: `${((cell.col + 0.5 + off.dx) / RING_SIDE) * 100}%`,
            top: `${((cell.row + 0.5 + off.dy) / RING_SIDE) * 100}%`,
            '--seat-color': t.color,
          } as CSSProperties;
          return (
            <div
              key={t.seat}
              className={`token${t.active ? ' token-active' : ''}`}
              style={style}
              title={t.name}
            >
              <AssetImage
                className="token-icon"
                path={jobImagePath(t.job)}
                fallback={JOB_ICON[t.job]}
                alt={JOB_LABEL[t.job]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
