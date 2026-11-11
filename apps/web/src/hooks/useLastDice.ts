import type { GameEvent, PublicGameState } from '@dragon-rush/engine';
import { useEffect, useState } from 'react';

export interface DiceView {
  readonly value: number | null;
  readonly rolling: boolean;
}

/** Last dice value shown on the board; it stays visible after the turn that rolled it. */
export function useLastDice(current: GameEvent | null, display: PublicGameState | null): DiceView {
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    if (current?.type === 'DiceRolled') setLast(current.value);
  }, [current]);
  const rolledNow = current?.type === 'DiceRolled' ? current.value : null;
  return { value: rolledNow ?? display?.turn.dice ?? last, rolling: rolledNow !== null };
}
