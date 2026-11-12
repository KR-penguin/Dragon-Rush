import type { CombatKind } from '@dragon-rush/combat';
import { useEffect } from 'react';
import { playBgm } from '../services/audio';

/** Dragon fights get the battle track while the fight screen is up; the board track returns after. */
export function useFightBgm(kind: CombatKind): void {
  useEffect(() => {
    if (kind !== 'dragonFight') return;
    playBgm('dragon_battle');
    return () => playBgm('board');
  }, [kind]);
}
