import type { GameEvent, SeatId } from '@hero-dice/engine';
import type { SfxName } from '../types/assetPaths';

/** Sound effect for an event as it is shown, or null. Movement steps are voiced by the board itself. */
export function sfxForEvent(e: GameEvent, controllable: readonly SeatId[]): SfxName | null {
  switch (e.type) {
    case 'DiceRolled':
      return 'dice_roll';
    case 'StartBonus':
    case 'CoinsStolen':
    case 'ItemBought':
      return 'coin';
    case 'LootTransferred':
      return e.coins > 0 ? 'coin' : null;
    case 'EffectApplied':
      if (e.effect === 'coins' && e.delta > 0) return 'coin';
      if (e.effect === 'randomItem') return 'item_use';
      return null;
    case 'StatUpgraded':
      return 'upgrade';
    case 'ItemUsed':
      return e.item === 'shield' ? null : 'item_use';
    case 'ShieldUsed':
      return 'shield';
    case 'CombatHit':
      return e.breath ? 'dragon_breath' : 'attack_hit';
    case 'GameEnded': {
      const winner = e.outcome.winner;
      const mine = winner !== null && (controllable.length === 0 || controllable.includes(winner));
      return mine ? 'victory' : 'defeat';
    }
    default:
      return null;
  }
}
