import { BOARD_SIZE, type GameEvent, type SeatId } from '@dragon-rush/engine';
import type { SoundName } from '../fx/audio/soundCatalog';
import { diceLandMs, hopTimings, scaled } from '../fx/timing';
import type { SfxName } from '../types/assetPaths';
import type { TileTone } from '../types/tileView';

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
    case 'GameEnded':
      return isLocalWin(e, controllable) ? 'victory' : 'defeat';
    default:
      return null;
  }
}

const isLocalWin = (
  e: Extract<GameEvent, { type: 'GameEnded' }>,
  controllable: readonly SeatId[],
): boolean => {
  const winner = e.outcome.winner;
  return winner !== null && (controllable.length === 0 || controllable.includes(winner));
};

export interface SoundCue {
  readonly name: SoundName;
  /** Real ms after the event is shown (already divided by the animation speed). */
  readonly delayMs?: number;
  readonly volume?: number;
  /** Rising sequences: +1 semitone per step. */
  readonly semitones?: number;
}

export interface SoundContext {
  readonly controllable: readonly SeatId[];
  readonly speed?: number;
  readonly boardSize?: number;
  /** Tile colour family, for landing chimes and thuds. */
  readonly toneOf?: (tile: number) => TileTone | null;
}

/**
 * Full sound design for an event, timed against the board animation. Coin showers are voiced by
 * their arrivals (one clink per coin, rising), so coin gains have no sound here.
 */
export function soundCuesForEvent(e: GameEvent, ctx: SoundContext): SoundCue[] {
  const speed = ctx.speed ?? 1;
  switch (e.type) {
    case 'TurnStarted':
      return !e.resting && ctx.controllable.includes(e.seat) ? [{ name: 'turn_chime' }] : [];
    case 'DiceRolled':
      return [{ name: 'dice_roll' }, { name: 'dice_land', delayMs: diceLandMs(e, speed) }];
    case 'MoveAdjusted':
      return e.delta === 0 ? [] : [{ name: 'swing', volume: 0.5 }];
    case 'Moved': {
      if (e.via === 'teleport') return [{ name: 'magic' }];
      const hops = hopTimings(e, speed, ctx.boardSize ?? BOARD_SIZE);
      const cues: SoundCue[] = hops.map((h, i) => ({
        name: 'move_step',
        delayMs: h.startMs,
        semitones: Math.min(12, i),
      }));
      const last = hops.at(-1);
      if (last) cues.push({ name: 'land', delayMs: last.landMs });
      return cues;
    }
    case 'StartBonus':
      return e.hp > 0 ? [{ name: 'heal', delayMs: scaled(150, speed) }] : [];
    case 'TileResolved': {
      const tone = ctx.toneOf?.(e.tile) ?? null;
      if (tone === 'good') return [{ name: 'chime' }];
      if (tone === 'bad') return [{ name: 'thud' }];
      return [];
    }
    case 'MysteryCardDrawn':
      return [{ name: 'magic', volume: 0.6 }];
    case 'EffectApplied':
      switch (e.effect) {
        case 'hp':
          return e.delta > 0 ? [{ name: 'heal' }] : [];
        case 'stat':
        case 'maxHp':
          return [{ name: 'upgrade' }];
        case 'randomItem':
          return [{ name: 'item_use' }];
        default:
          return [];
      }
    case 'StatUpgraded':
      return [{ name: 'upgrade' }];
    case 'ItemBought':
      return [{ name: 'buy' }];
    case 'ItemUsed':
      return e.item === 'thief' ? [{ name: 'item_use' }] : [];
    case 'PvpTriggered':
      return [{ name: 'swing' }];
    case 'ShieldUsed':
      return [{ name: 'shield' }];
    case 'CombatStarted':
      return e.kind === 'dragonFight'
        ? [{ name: 'dragon_roar' }]
        : [{ name: 'swing' }, { name: 'crit', volume: 0.7 }];
    case 'CombatHit': {
      if (e.evaded || e.damage <= 0) return [{ name: 'swing' }];
      const cues: SoundCue[] = [{ name: e.breath ? 'dragon_breath' : 'attack_hit' }];
      if (e.rage || e.firstStrike) cues.push({ name: 'crit' });
      return cues;
    }
    case 'PassiveTriggered':
      return e.passive === 'indomitable' ? [{ name: 'parry' }, { name: 'chime' }] : [];
    case 'PlayerEliminated':
      return [{ name: 'eliminate' }];
    case 'GameEnded':
      return [{ name: isLocalWin(e, ctx.controllable) ? 'victory' : 'defeat' }];
    default:
      return [];
  }
}
