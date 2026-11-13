import { memo, type ComponentProps } from 'react';
import { Board, type BoardProps } from './Board';
import { DragonLair } from './DragonLair';

type LairProps = ComponentProps<typeof DragonLair>;
const Lair = memo(DragonLair);
interface BoardSceneProps extends Omit<BoardProps, 'children'> {
  dragon: LairProps['dragon'];
  lairState: LairProps['state'];
  round: number;
  breathLit: number;
  onLegend: LairProps['onLegend'];
}

/** Countdown and transient HUD updates do not change the board's painted subtree. */
export const BoardScene = memo(function BoardScene({
  dragon,
  lairState,
  round,
  breathLit,
  onLegend,
  ...board
}: BoardSceneProps) {
  return (
    <Board {...board}>
      <Lair
        dragon={dragon}
        state={lairState}
        round={round}
        breathLit={breathLit}
        legend={board.legend}
        onLegend={onLegend}
      />
    </Board>
  );
});
