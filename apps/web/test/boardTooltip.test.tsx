import { DEFAULT_RULES } from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BoardTile } from '../src/components/board/BoardTile';
import { TileTooltip } from '../src/components/board/TileTooltip';
import { tileSide } from '../src/types/boardGeometry';
import { ringCell } from '../src/types/boardLayout';
import { effectChips, tileCategory } from '../src/types/tileView';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

describe('board tile descriptions', () => {
  it('makes every board position focusable with a matching tooltip', () => {
    DEFAULT_RULES.board.forEach((tile, index) => {
      const cell = ringCell(index);
      const html = renderToStaticMarkup(
        <BoardTile
          index={index}
          tile={tile}
          category={tileCategory(tile, index)}
          chips={effectChips(tile.effects)}
          side={tileSide(index)}
          row={cell.row}
          col={cell.col}
          flags={{ target: false, preview: false, active: false, flash: false }}
          onHover={() => undefined}
        />,
      );
      const tooltip = renderToStaticMarkup(
        <TileTooltip
          hover={{ index, rect: { left: 500, top: 300, width: 120, height: 120 } }}
          tiles={DEFAULT_RULES.board}
          occupants={[]}
        />,
      );
      expect(html).toContain(`data-fx-anchor="tile:${index}"`);
      expect(html).toContain('tabindex="0"');
      expect(html).toContain(`aria-describedby="tile-tooltip-${index}"`);
      expect(tooltip).toContain(`id="tile-tooltip-${index}"`);
      expect(tooltip).toContain(`${index}번 칸`);
    });
  });
});
