import type { CombatantRef, GameEvent, PassiveId, SeatId } from '@dragon-rush/engine';
import { soundCuesForEvent } from '../animation/eventSfx';
import { ITEM_LABEL, STAT_LABEL } from '../types/labels';
import type { TileTone } from '../types/tileView';
import {
  TRAUMA,
  coinGainCues,
  coinLossCues,
  deathCues,
  healCues,
  hitCues,
  hitStrength,
  magicCues,
  victoryCues,
} from './recipes';
import { diceLandMs, hopTimings, scaled } from './timing';
import type { FxAnchor, FxCue } from './types';

/** Who stands on the left (a) and right (b) of the fight currently on screen. */
export interface CombatSides {
  readonly a: CombatantRef;
  readonly b: CombatantRef;
}

export interface FxEventContext {
  readonly controllable: readonly SeatId[];
  /** Board animation speed (1, 2, 4): delays and time effects are divided by it. */
  readonly speed: number;
  readonly combat: CombatSides | null;
  readonly maxHpOf: (ref: CombatantRef) => number;
  readonly toneOf: (tile: number) => TileTone | null;
  readonly boardSize: number;
}

/** Tracks the fight on screen across events (pure reducer). */
export function trackCombat(prev: CombatSides | null, e: GameEvent): CombatSides | null {
  if (e.type === 'CombatStarted') return { a: e.a, b: e.b };
  if (e.type === 'TurnEnded' || e.type === 'GameEnded') return null;
  return prev;
}

const seat = (s: SeatId): FxAnchor => ({ kind: 'seat', seat: s });
const tile = (t: number): FxAnchor => ({ kind: 'tile', tile: t });
const hud = (s: SeatId, slot: 'panel' | 'coins' | 'hp' = 'panel'): FxAnchor => ({
  kind: 'hud',
  seat: s,
  slot,
});
const DICE: FxAnchor = { kind: 'dice' };
const CENTER: FxAnchor = { kind: 'screen', at: 'center' };

function fighter(ctx: FxEventContext, ref: CombatantRef): FxAnchor {
  const side = ctx.combat ? (ctx.combat.a === ref ? 'a' : ctx.combat.b === ref ? 'b' : null) : null;
  if (side === null && ref !== 'dragon') return seat(ref);
  return { kind: 'combatant', ref, side };
}

const PASSIVE_CALLOUT: Record<PassiveId, string> = {
  indomitable: '불굴!',
  firstStrike: '선제!',
  evade: '회피',
  rage: '광폭!',
  pierce: '관통',
};

const withSounds = (cues: FxCue[], e: GameEvent, ctx: FxEventContext): FxCue[] => [
  ...soundCuesForEvent(e, ctx).map((s): FxCue => ({
    type: 'sound',
    name: s.name,
    volume: s.volume,
    semitones: s.semitones,
    delayMs: s.delayMs,
  })),
  ...cues,
];

/**
 * Board GameEvent → effect cues. Pure: anchors stay symbolic and are resolved by the board
 * renderer at play time. See the table in the module tests for the full mapping.
 */
export function fxForEvent(e: GameEvent, ctx: FxEventContext): FxCue[] {
  return withSounds(visualCues(e, ctx), e, ctx);
}

function visualCues(e: GameEvent, ctx: FxEventContext): FxCue[] {
  const speed = ctx.speed;
  const mine = (s: CombatantRef) => s !== 'dragon' && ctx.controllable.includes(s);
  switch (e.type) {
    case 'TurnStarted':
      return [{ type: 'punch', at: hud(e.seat), kind: 'pop' }];

    case 'DiceRolled': {
      const land = diceLandMs(e, speed);
      return [
        { type: 'burst', preset: 'landDust', at: DICE, amount: 0.6, delayMs: land },
        { type: 'shake', trauma: TRAUMA.diceLand, delayMs: land },
        { type: 'punch', at: DICE, kind: 'pop', delayMs: land },
      ];
    }

    case 'MoveAdjusted':
      if (e.delta === 0) return [];
      return [
        { type: 'text', kind: 'callout', text: e.delta > 0 ? '+1' : '−1', at: seat(e.seat) },
        { type: 'burst', preset: 'magic', at: seat(e.seat), amount: 0.4 },
      ];

    case 'Moved': {
      if (e.via === 'teleport') {
        const arrive = scaled(150, speed);
        return [
          ...magicCues(tile(e.from)),
          { type: 'burst', preset: 'magic', at: tile(e.to), delayMs: arrive },
          { type: 'ring', preset: 'heavy', at: tile(e.to), color: '#B38CFF', delayMs: arrive },
          { type: 'punch', at: tile(e.to), kind: 'glow', delayMs: arrive },
          { type: 'shake', trauma: TRAUMA.thiefOrTeleport, delayMs: arrive },
        ];
      }
      const hops = hopTimings(e, speed, ctx.boardSize);
      const cues: FxCue[] = hops.map((h) => ({
        type: 'burst',
        preset: 'dust',
        at: tile(h.tile),
        delayMs: h.landMs,
      }));
      const last = hops.at(-1);
      if (last) {
        cues.push(
          { type: 'burst', preset: 'landDust', at: tile(last.tile), delayMs: last.landMs },
          { type: 'punch', at: tile(last.tile), kind: 'glow', delayMs: last.landMs },
        );
      }
      return cues;
    }

    case 'StartBonus':
      return [
        { type: 'punch', at: tile(0), kind: 'glow' },
        ...coinGainCues({ from: seat(e.seat), to: hud(e.seat, 'coins'), coins: e.coins }),
        ...healCues({ at: seat(e.seat), amount: e.hp, delayMs: scaled(150, speed) }),
      ];

    case 'TileResolved': {
      const tone = ctx.toneOf(e.tile);
      if (tone === 'good') {
        return [
          { type: 'punch', at: tile(e.tile), kind: 'glow' },
          { type: 'burst', preset: 'goldSparkle', at: tile(e.tile) },
        ];
      }
      if (tone === 'bad') {
        return [
          { type: 'punch', at: tile(e.tile), kind: 'wobble' },
          { type: 'burst', preset: 'smokeDark', at: tile(e.tile) },
          { type: 'shake', trauma: TRAUMA.badTile },
        ];
      }
      if (tone === 'special') {
        return [
          { type: 'punch', at: tile(e.tile), kind: 'darken' },
          { type: 'punch', at: tile(e.tile), kind: 'pop', delayMs: scaled(300, speed) },
        ];
      }
      return [];
    }

    case 'MysteryCardDrawn':
      return magicCues(seat(e.seat), 0.8);

    case 'EffectApplied': {
      const at = seat(e.seat);
      switch (e.effect) {
        case 'coins':
          return e.delta > 0
            ? coinGainCues({ from: at, to: hud(e.seat, 'coins'), coins: e.delta })
            : coinLossCues({ at, coins: -e.delta, purse: hud(e.seat, 'coins') });
        case 'hp':
          if (e.delta > 0) return healCues({ at, amount: e.delta });
          if (e.delta === 0) return [];
          return [
            { type: 'text', kind: 'loss', value: -e.delta, at },
            { type: 'burst', preset: 'sparkLight', at },
            { type: 'punch', at: hud(e.seat, 'hp'), kind: 'wobble' },
            ...(mine(e.seat)
              ? [{ type: 'vignette', tone: 'red', strength: 0.35, ms: 500 } as const]
              : []),
          ];
        case 'stat':
        case 'maxHp':
          return [
            { type: 'burst', preset: 'goldSparkle', at },
            {
              type: 'text',
              kind: 'callout',
              text: `${STAT_LABEL[e.effect === 'maxHp' ? 'maxHp' : (e.stat ?? 'atk')]} +${e.delta}`,
              at,
            },
            { type: 'punch', at: hud(e.seat), kind: 'pop' },
          ];
        case 'skipTurn':
          return [
            { type: 'text', kind: 'callout', text: '쉬는 턴', at },
            { type: 'burst', preset: 'smokeDark', at, amount: 0.4 },
          ];
        case 'randomItem':
          return [
            ...magicCues(at),
            { type: 'text', kind: 'callout', text: `${ITEM_LABEL[e.item ?? 'shield']} 획득`, at },
          ];
        default:
          return [];
      }
    }

    case 'StatUpgraded':
      return [
        { type: 'burst', preset: 'goldSparkle', at: hud(e.seat) },
        { type: 'text', kind: 'callout', text: `${STAT_LABEL[e.stat]} ↑`, at: hud(e.seat) },
        { type: 'punch', at: hud(e.seat), kind: 'pop' },
        ...(e.free
          ? []
          : [{ type: 'text', kind: 'loss', value: e.cost, at: hud(e.seat, 'coins') } as const]),
      ];

    case 'ItemBought':
      return [
        { type: 'text', kind: 'loss', value: e.price, at: hud(e.seat, 'coins') },
        { type: 'burst', preset: 'magic', at: hud(e.seat), amount: 0.5 },
        {
          type: 'text',
          kind: 'callout',
          text: ITEM_LABEL[e.item],
          at: hud(e.seat),
          delayMs: scaled(120, speed),
        },
        { type: 'punch', at: hud(e.seat), kind: 'pop' },
      ];

    case 'ItemUsed':
      return e.item === 'thief'
        ? [...magicCues(seat(e.seat), 0.7), { type: 'shake', trauma: TRAUMA.thiefOrTeleport }]
        : [];

    case 'CoinsStolen':
      return [
        { type: 'coins', from: seat(e.from), to: hud(e.to, 'coins'), coins: e.amount },
        { type: 'text', kind: 'loss', value: e.amount, at: seat(e.from) },
      ];

    case 'PvpTriggered':
      return [
        { type: 'ring', preset: 'heavy', at: seat(e.arriver), color: '#FF7A3D' },
        { type: 'text', kind: 'callout', text: '결투!', at: seat(e.arriver) },
      ];

    case 'ShieldUsed':
      return [
        { type: 'burst', preset: 'shield', at: seat(e.seat) },
        { type: 'ring', preset: 'heavy', at: seat(e.seat), color: '#8FB3D9' },
        { type: 'text', kind: 'callout', text: '방어막!', at: seat(e.seat) },
        { type: 'flash', tone: 'white', alpha: 0.2, ms: 60 },
        { type: 'shake', trauma: 0.3 },
      ];

    case 'CombatStarted': {
      const dragon = e.kind === 'dragonFight';
      return [
        { type: 'shake', trauma: TRAUMA.challenge },
        { type: 'flash', tone: 'white', alpha: 0.3, ms: 80 },
        { type: 'vignette', tone: dragon ? 'red' : 'dark', strength: 0.5, ms: 900 },
        { type: 'duck' },
        ...(dragon ? [{ type: 'burst', preset: 'embers', at: CENTER, amount: 1.5 } as const] : []),
      ];
    }

    case 'CombatHit': {
      const at = fighter(ctx, e.defender);
      const attackerSide = ctx.combat ? (ctx.combat.a === e.attacker ? 'a' : 'b') : null;
      return hitCues({
        at,
        damage: e.damage,
        strength: hitStrength(e.damage, ctx.maxHpOf(e.defender)),
        hostile: e.attacker === 'dragon' && e.defender !== 'dragon',
        heavy: e.rage || e.firstStrike || e.breath ? true : undefined,
        evaded: e.evaded,
        breath: e.breath,
        angle: attackerSide === 'a' ? 0 : attackerSide === 'b' ? Math.PI : undefined,
        target: `combatant:${e.defender}`,
        mine: mine(e.defender),
        speed,
      });
    }

    case 'PassiveTriggered': {
      const at = fighter(ctx, e.seat);
      if (e.passive === 'indomitable') {
        return [
          { type: 'text', kind: 'lastStand', text: PASSIVE_CALLOUT.indomitable, at },
          { type: 'shake', trauma: TRAUMA.lastStand },
          { type: 'flash', tone: 'gold', alpha: 0.3, ms: 80 },
          { type: 'burst', preset: 'goldSparkle', at, amount: 1.5 },
        ];
      }
      if (e.passive === 'evade') return [];
      return [
        { type: 'text', kind: 'callout', text: PASSIVE_CALLOUT[e.passive], at },
        { type: 'burst', preset: e.passive === 'rage' ? 'embers' : 'goldSparkle', at, amount: 0.6 },
      ];
    }

    case 'CombatEnded':
      return [
        { type: 'ring', preset: 'heavy', at: fighter(ctx, e.winner), color: '#F6D47A' },
        { type: 'burst', preset: 'goldSparkle', at: fighter(ctx, e.winner) },
      ];

    case 'PlayerEliminated':
      return deathCues({ at: fighter(ctx, e.seat), speed, mine: mine(e.seat) });

    case 'LootTransferred':
      return e.coins > 0
        ? [{ type: 'coins', from: fighter(ctx, e.from), to: hud(e.to, 'coins'), coins: e.coins }]
        : [];

    case 'GameEnded': {
      const winner = e.outcome.winner;
      if (winner === null) return [];
      const local = ctx.controllable.length === 0 || ctx.controllable.includes(winner);
      return local ? victoryCues() : [{ type: 'vignette', tone: 'dark', strength: 0.6, ms: 1500 }];
    }

    case 'RoundStarted':
    case 'TurnSkipped':
    case 'PvpTargetChosen':
    case 'TurnEnded':
      return [];
  }
}
