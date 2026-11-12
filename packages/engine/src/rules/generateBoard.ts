import { shuffle } from '../rng';
import type { RngState, RulesConfig, TileDef } from '../types';

/** Builds one public board from the game's seeded RNG; fixed landmarks keep their positions. */
export function generateBoard(
  rules: RulesConfig,
  rng: RngState,
): [readonly TileDef[], RngState] {
  const variation = rules.boardVariation;
  if (!variation) return [rules.board, rng];

  const fixed = new Set(variation.fixedTiles);
  const oldTiles = rules.board.filter((_, index) => !fixed.has(index));
  const [shuffledOld, afterOld] = shuffle(rng, oldTiles);
  const [shuffledGood, afterGood] = shuffle(afterOld, variation.good);
  const [shuffledBad, afterBad] = shuffle(afterGood, variation.bad);
  const count = variation.newPerKind;
  const [shuffledBoard, nextRng] = shuffle(afterBad, [
    ...shuffledOld.slice(0, oldTiles.length - 2 * count),
    ...shuffledGood.slice(0, count),
    ...shuffledBad.slice(0, count),
  ]);

  let cursor = 0;
  const board = rules.board.map((tile, index) =>
    fixed.has(index) ? tile : shuffledBoard[cursor++]!,
  );
  const pureHealing = (tile: TileDef) =>
    tile.effects.length > 0 &&
    tile.effects.every((effect) => effect.kind === 'hp' && effect.amount > 0);
  const openingEnd = Math.min(rules.movement.rollSides, board.length - 1);
  for (let index = 1; index <= openingEnd; index++) {
    if (fixed.has(index) || !pureHealing(board[index]!)) continue;
    const later = board.findIndex(
      (tile, target) => target > openingEnd && !fixed.has(target) && !pureHealing(tile),
    );
    if (later < 0) break;
    [board[index], board[later]] = [board[later]!, board[index]!];
  }
  return [board, nextRng];
}
