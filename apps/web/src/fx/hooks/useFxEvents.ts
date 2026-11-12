import { BOARD_SIZE, type CombatantRef, type PublicGameState } from '@dragon-rush/engine';
import { useEffect } from 'react';
import type { GameStore } from '../../store/gameStore';
import { tileTone } from '../../types/tileView';
import { fxForEvent, trackCombat, type CombatSides } from '../eventFx';
import { fx } from '../runtime/fxInstance';
import type { FxResolver } from '../types';

const maxHpOf = (display: PublicGameState | null, ref: CombatantRef): number => {
  if (!display) return 40;
  if (ref === 'dragon') return display.rules.dragon.hp;
  return display.players.find((p) => p.seat === ref)?.maxHp ?? 40;
};

/** Plays mapped effects for each event as the animation queue shows it. */
export function useFxEvents(store: GameStore | undefined, resolver: FxResolver | undefined): void {
  useEffect(() => {
    if (!store || !resolver) return;
    let combat: CombatSides | null = null;
    let shown = 0;
    const unsubscribe = store.subscribe((s, prev) => {
      if (!s.current || s.current === prev.current) return;
      const e = s.current;
      combat = trackCombat(combat, e);
      const display = s.display;
      const cues = fxForEvent(e, {
        controllable: s.latest?.controllableSeats ?? [],
        speed: s.speed,
        combat,
        maxHpOf: (ref) => maxHpOf(display, ref),
        toneOf: (tile) => {
          const def = display?.rules.board[tile];
          return def ? tileTone(def) : null;
        },
        boardSize: display?.rules.board.length ?? BOARD_SIZE,
      });
      // FX randomness is seeded per shown event, never from the game RNG.
      fx.play(cues, resolver, (s.latest?.version ?? 0) * 1000 + ++shown);
    });
    return () => {
      unsubscribe();
      fx.cancelPending();
    };
  }, [store, resolver]);
}
