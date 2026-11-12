import type { TileDef } from '@dragon-rush/engine';
import { useMemo, type CSSProperties, type ReactNode, type Ref } from 'react';
import {
  GRID_TEMPLATE,
  pawnSpot,
  PERSPECTIVE_ORIGIN,
  PERSPECTIVE_PX,
  PLANE_SIZE,
  tileSide,
  type StageFit,
} from '../../types/boardGeometry';
import { ringCell, tokenSlots } from '../../types/boardLayout';
import { effectChips, tileCategory, type TileCategory } from '../../types/tileView';
import { BoardTile } from './BoardTile';
import { Pawn, type PawnView } from './Pawn';

interface BoardProps {
  tiles: readonly TileDef[];
  pawns: readonly PawnView[];
  /** Tiles that can be picked right now (teleport destinations), or null. */
  targets: ReadonlySet<number> | null;
  /** Destination being previewed (ninja move adjust hover), or null. */
  preview: number | null;
  activeTile: number | null;
  /** Tile that just resolved: flashes for 80 ms, then glows. */
  flashTile: number | null;
  /** Category lifted by a legend hover. */
  legend: TileCategory | null;
  tiltDeg: number;
  fit: StageFit;
  reduced: boolean;
  cameraRef: Ref<HTMLDivElement>;
  backgroundUrl: string | null;
  onPickTile?: (tile: number) => void;
  onHoverTile?: (tile: number | null, el: HTMLElement | null) => void;
  /** The lair, drawn in the grid centre. */
  children?: ReactNode;
}

/**
 * The war table. Layer tree (decision sheet §1.4): `.stage` (perspective, fit) > `.camera` (WAAPI
 * beats) > `.board3d` (rotateX tilt, preserve-3d) > tiles + token layer. Never put filter, opacity,
 * overflow:hidden, clip-path, mask, blend modes, isolation or contain:paint on these layers.
 */
export function Board({
  tiles,
  pawns,
  targets,
  preview,
  activeTile,
  flashTile,
  legend,
  tiltDeg,
  fit,
  reduced,
  cameraRef,
  backgroundUrl,
  onPickTile,
  onHoverTile,
  children,
}: BoardProps) {
  const slots = useMemo(() => tokenSlots(pawns.filter((p) => !p.out)), [pawns]);
  const meta = useMemo(
    () =>
      tiles.map((tile, index) => ({
        cell: ringCell(index),
        side: tileSide(index),
        category: tileCategory(tile, index),
        chips: effectChips(tile.effects),
      })),
    [tiles],
  );
  const stageStyle = {
    width: PLANE_SIZE,
    height: PLANE_SIZE,
    perspective: `${PERSPECTIVE_PX}px`,
    perspectiveOrigin: `${PERSPECTIVE_ORIGIN.x * 100}% ${PERSPECTIVE_ORIGIN.y * 100}%`,
    transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
    '--tilt': `${tiltDeg}deg`,
  } as CSSProperties;

  return (
    // `board`: the FX toolkit pauses CSS animations under `.board` during hit-stop.
    <div className="stage board" style={stageStyle}>
      <div className="camera" ref={cameraRef}>
        <div className={`board3d${targets ? ' is-picking' : ''}`} data-legend={legend ?? undefined}>
          <div
            className="board-rim"
            style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
          />
          <div
            className="board-grid"
            style={{ gridTemplateColumns: GRID_TEMPLATE, gridTemplateRows: GRID_TEMPLATE }}
          >
            {tiles.map((tile, index) => {
              const m = meta[index]!;
              return (
                <BoardTile
                  key={index}
                  index={index}
                  tile={tile}
                  category={m.category}
                  chips={m.chips}
                  side={m.side}
                  row={m.cell.row}
                  col={m.cell.col}
                  flags={{
                    target: targets?.has(index) ?? false,
                    preview: preview === index,
                    active: activeTile === index,
                    flash: flashTile === index,
                  }}
                  {...(onPickTile ? { onPick: () => onPickTile(index) } : {})}
                  {...(onHoverTile ? { onHover: onHoverTile } : {})}
                />
              );
            })}
            {children}
          </div>
          <div className="token-layer" aria-hidden="true">
            {pawns.map((p) => {
              const slot = slots.get(p.seat);
              const spot = pawnSpot(p.tile, slot?.slot ?? 0, slot?.count ?? 1);
              return <Pawn key={p.seat} view={p} spot={spot} reduced={reduced} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
