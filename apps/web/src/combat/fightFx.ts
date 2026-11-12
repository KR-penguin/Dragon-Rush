import type {
  CombatantId,
  CombatEvent,
  CombatKind,
  CombatRules,
  MoveId,
  Side,
  Vec,
} from '@dragon-rush/combat';
import type { SoundName } from '../fx/audio/soundCatalog';
import { DRAGON_DEATH_STOP, KO_STOP } from '../fx/core/time';
import { TRAUMA } from '../fx/recipes';
import type { ArenaHitKind } from '../fx/recipes';
import type { FxAnchor, FxCue } from '../fx/types';

/** Arena effect commands: plain cues plus the arena-only camera moves and sprite reactions. */
export type FightFxCommand =
  | { readonly type: 'cues'; readonly cues: readonly FxCue[] }
  | {
      readonly type: 'hit';
      readonly x: number;
      readonly y: number;
      readonly damage: number;
      readonly kind: ArenaHitKind;
      readonly dirX: number;
      readonly dirY: number;
      readonly target: string;
      readonly evaded?: boolean;
      readonly breath?: boolean;
      readonly mine?: boolean;
      readonly sound?: boolean;
    }
  | { readonly type: 'kick'; readonly dirX: number; readonly dirY: number; readonly px?: number }
  | { readonly type: 'zoom'; readonly amount?: number }
  /** Sprite flash + hit shake on the target (renderer state). */
  | {
      readonly type: 'flinch';
      readonly who: CombatantId;
      readonly dir: number;
      readonly ticks: number;
    }
  /** Text over a fighter wherever it stands now (events without a position). */
  | { readonly type: 'callout'; readonly who: CombatantId; readonly text: string }
  | { readonly type: 'ko'; readonly who: CombatantId };

export interface FightFxContext {
  readonly kind: CombatKind;
  readonly rules: CombatRules;
  /** Arena px (event positions) → logical canvas px. */
  readonly origin: { readonly x: number; readonly y: number };
  /** Sides a human on this screen plays (red edge vignette when they are hurt). */
  readonly localSides: readonly Side[];
  /** 4× highlight replay: skip the small move sounds so hits stay readable. */
  readonly replay?: boolean;
}

/** Floating text and sparks sit at chest height above a fighter's ground position. */
const CHEST = 22;

const point = (ctx: FightFxContext, p: Vec, lift = 0): FxAnchor => ({
  kind: 'point',
  x: ctx.origin.x + p.x,
  y: ctx.origin.y + p.y - lift,
});

const bamDir = (bam: number) => {
  const a = (bam / 256) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

const sound = (name: SoundName, volume?: number): FxCue =>
  volume === undefined ? { type: 'sound', name } : { type: 'sound', name, volume };

const MOVE_SOUND: Readonly<Record<MoveId, SoundName>> = {
  slash1: 'blade',
  slash2: 'blade',
  thrust: 'blade',
  parry: 'parry',
  counter: 'blade',
  draw: 'swing',
  quickShot: 'shot',
  fullShot: 'shot',
  volley: 'shot',
  bolt: 'magic',
  meteor: 'magic',
  dagger1: 'dagger',
  dagger2: 'dagger',
  kunai: 'kunai',
  greataxe: 'axe',
  whirlwind: 'axe',
};

const isLocal = (ctx: FightFxContext, who: CombatantId | 'ring'): boolean =>
  who !== 'dragon' && who !== 'ring' && ctx.localSides.includes(who);

/**
 * Sim event → presentation (art-direction §11.3 trauma table, §11.6 numbers). Pure: the screen
 * applies the commands to ArenaFx, the renderer and the audio engine.
 */
export function fightFxFor(e: CombatEvent, ctx: FightFxContext): FightFxCommand[] {
  switch (e.type) {
    case 'AttackStart':
      return ctx.replay ? [] : [{ type: 'cues', cues: [sound(MOVE_SOUND[e.move], 0.8)] }];
    case 'SkillUsed':
      return ctx.replay ? [] : [{ type: 'cues', cues: [sound(MOVE_SOUND[e.skill])] }];
    case 'Dash':
      if (ctx.replay) return [];
      return [
        {
          type: 'cues',
          cues: [
            sound('dash', 0.8),
            { type: 'burst', preset: 'dust', at: point(ctx, e.pos), amount: 0.5 },
          ],
        },
      ];
    case 'ProjectileEnd':
      return e.reason === 'wall'
        ? [
            {
              type: 'cues',
              cues: [{ type: 'burst', preset: 'dust', at: point(ctx, e.pos), amount: 0.3 }],
            },
          ]
        : [];
    case 'Hit': {
      const dir = bamDir(e.dir);
      const hostile = e.attacker === 'dragon';
      const dot = e.kind === 'breath' || e.kind === 'burningFloor' || e.kind === 'ring';
      const heavy = e.hitstop >= ctx.rules.hitstop.heavy || e.weakPoint;
      const kind: ArenaHitKind = hostile && !dot ? 'hostile' : heavy ? 'heavy' : 'light';
      const lift = e.target === 'dragon' ? 0 : CHEST;
      const at = point(ctx, e.pos, lift);
      const out: FightFxCommand[] = [
        {
          type: 'hit',
          x: at.kind === 'point' ? at.x : 0,
          y: at.kind === 'point' ? at.y : 0,
          damage: e.dmg,
          kind,
          dirX: dir.x,
          dirY: dir.y,
          target: e.target,
          breath: e.kind === 'breath',
          mine: isLocal(ctx, e.target),
          // Damage-over-time ticks would machine-gun the impact sound.
          sound: !dot,
        },
        { type: 'flinch', who: e.target, dir: e.dir, ticks: Math.max(2, e.hitstop) },
      ];
      const callouts: FxCue[] = [];
      if (e.firstStrike)
        callouts.push({
          type: 'text',
          kind: 'heavy',
          text: '선제!',
          at: point(ctx, e.pos, lift + 16),
        });
      if (e.weakPoint) {
        callouts.push({ type: 'text', kind: 'heavy', text: '약점!', at: point(ctx, e.pos, 24) });
        callouts.push({ type: 'ring', preset: 'heavy', at, color: '#F6D47A' });
      }
      if (dot && e.kind !== 'breath') callouts.push(sound('thud', 0.35));
      if (callouts.length) out.push({ type: 'cues', cues: callouts });
      if (e.kind === 'dive' || e.kind === 'charge')
        out.push({ type: 'cues', cues: [{ type: 'shake', trauma: 0.2 }] });
      return out;
    }
    case 'Parry':
      return [
        {
          type: 'hit',
          ...xy(point(ctx, e.pos, CHEST)),
          damage: 0,
          kind: 'parry',
          dirX: 0,
          dirY: 0,
          target: e.who,
        },
      ];
    case 'Evade':
      return [
        {
          type: 'hit',
          ...xy(point(ctx, e.pos, CHEST)),
          damage: 0,
          kind: 'light',
          dirX: 0,
          dirY: 0,
          target: e.who,
          evaded: true,
        },
      ];
    case 'LastStand': {
      const at = point(ctx, e.pos, CHEST);
      return [
        {
          type: 'cues',
          cues: [
            { type: 'text', kind: 'lastStand', text: '불굴!', at: point(ctx, e.pos, CHEST + 18) },
            { type: 'shake', trauma: TRAUMA.lastStand },
            { type: 'flash', tone: 'gold', alpha: 0.3, ms: 80 },
            { type: 'burst', preset: 'goldSparkle', at, amount: 1.5 },
            { type: 'ring', preset: 'heavy', at, color: '#F6D47A' },
            sound('shield'),
          ],
        },
        { type: 'zoom', amount: 0.05 },
      ];
    }
    case 'RageOn':
      return [
        { type: 'cues', cues: [sound('crit', 0.6)] },
        { type: 'callout', who: e.who, text: '광폭!' },
      ];
    case 'TelegraphStart': {
      const cues: FxCue[] =
        e.kind === 'breath'
          ? [sound('breath_charge')]
          : e.kind === 'meteor'
            ? [sound('magic', 0.7)]
            : e.kind === 'gust'
              ? [sound('telegraph', 0.5)]
              : [sound('telegraph', e.kind === 'fireball' ? 0.45 : 0.8)];
      if (e.kind === 'charge') cues.push({ type: 'caption', text: '용이 돌진한다!' });
      if (e.kind === 'dive') cues.push({ type: 'caption', text: '용이 날아오른다!' });
      return [{ type: 'cues', cues }];
    }
    case 'TelegraphEnd': {
      const out: FightFxCommand[] = [];
      if (e.ticks === 0) return out;
      const c = shapeCenter(ctx, e.shape);
      switch (e.kind) {
        case 'dive':
          out.push({
            type: 'cues',
            cues: [
              { type: 'shake', trauma: 0.65 },
              { type: 'ring', preset: 'dive', at: c, color: '#FFB25B' },
              { type: 'burst', preset: 'landDust', at: c, amount: 1.5 },
              sound('land'),
              sound('thud'),
            ],
          });
          break;
        case 'meteor':
        case 'fireball':
          out.push({
            type: 'cues',
            cues: [
              { type: 'shake', trauma: e.kind === 'meteor' ? TRAUMA.heavyHit : 0.25 },
              { type: 'ring', preset: 'heavy', at: c, color: '#FF7A3D' },
              { type: 'burst', preset: 'embers', at: c, amount: e.kind === 'meteor' ? 1 : 0.6 },
              sound('thud', e.kind === 'meteor' ? 1 : 0.6),
            ],
          });
          break;
        case 'breath':
          out.push({ type: 'cues', cues: [sound('dragon_breath')] });
          break;
        case 'charge':
          out.push({ type: 'cues', cues: [sound('dash'), sound('dragon_roar', 0.4)] });
          break;
        case 'claw':
        case 'tail':
          out.push({ type: 'cues', cues: [sound('swing'), { type: 'shake', trauma: 0.15 }] });
          break;
        case 'gust':
          out.push({
            type: 'cues',
            cues: [
              sound('swing', 0.6),
              { type: 'vignette', tone: 'moon', strength: 0.35, ms: 900 },
            ],
          });
          break;
        case 'volley':
          break;
      }
      return out;
    }
    case 'WallSlam': {
      const at = point(ctx, e.pos, e.who === 'dragon' ? 0 : 8);
      const dragon = e.who === 'dragon';
      return [
        {
          type: 'cues',
          cues: [
            { type: 'shake', trauma: dragon ? 0.6 : TRAUMA.parry },
            { type: 'burst', preset: 'landDust', at, amount: dragon ? 1.5 : 0.6 },
            sound('thud', dragon ? 1 : 0.7),
          ],
        },
      ];
    }
    case 'PhaseChange':
      return [
        {
          type: 'cues',
          cues: [
            { type: 'shake', trauma: 0.5 },
            sound('dragon_roar'),
            { type: 'vignette', tone: 'red', strength: 0.4, ms: 1000 },
          ],
        },
        { type: 'zoom', amount: 0.04 },
      ];
    case 'KO': {
      const dragon = e.who === 'dragon';
      const stop = dragon ? DRAGON_DEATH_STOP : KO_STOP;
      return [
        {
          type: 'cues',
          cues: [
            { type: 'shake', trauma: dragon ? TRAUMA.dragonDeath : TRAUMA.ko },
            { type: 'bossStop', ...stop },
            { type: 'burst', preset: 'smokeKo', at: point(ctx, e.pos, dragon ? 0 : CHEST) },
            dragon ? sound('dragon_roar') : sound('eliminate'),
            { type: 'duck' },
          ],
        },
        { type: 'zoom', amount: 0.06 },
        { type: 'ko', who: e.who },
      ];
    }
    case 'TimeUp':
      return [{ type: 'cues', cues: [sound('chime'), { type: 'caption', text: '시간 종료!' }] }];
    case 'FightEnded': {
      const won = ctx.localSides.length === 0 || ctx.localSides.includes(e.result.winner);
      return [{ type: 'cues', cues: [sound(won ? 'victory' : 'defeat')] }];
    }
    case 'ProjectileSpawn':
    case 'BreathTick':
      return [];
  }
}

function xy(a: FxAnchor): { x: number; y: number } {
  return a.kind === 'point' ? { x: a.x, y: a.y } : { x: 0, y: 0 };
}

function shapeCenter(
  ctx: FightFxContext,
  sh: { readonly x: number; readonly y: number },
): FxAnchor {
  return point(ctx, { x: sh.x, y: sh.y });
}
