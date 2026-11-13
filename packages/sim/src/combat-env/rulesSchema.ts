import { COMBAT_TICK_HZ } from '@dragon-rush/combat';
import { JOB_IDS } from '@dragon-rush/engine';
import { z } from 'zod';

const integer = z.number().int().nonnegative();
const positive = z.number().int().positive();
const angle = integer.max(128);
const moveId = z.enum([
  'slash1',
  'slash2',
  'thrust',
  'parry',
  'counter',
  'draw',
  'quickShot',
  'fullShot',
  'volley',
  'bolt',
  'meteor',
  'dagger1',
  'dagger2',
  'kunai',
  'greataxe',
  'whirlwind',
]);
const dashId = z.enum(['dash', 'backstep', 'blink', 'shadowStep', 'shoulderCharge']);
const hit = z.object({ power: integer, knockback: integer, hitstun: integer }).strict();
const dragonHit = hit.extend({ hitstop: integer, parryable: z.boolean() });
const baseMove = { startup: integer, recovery: integer, moveSpeedPct: integer };
const projectile = z
  .object({
    speed: positive,
    radius: positive,
    range: positive,
    pierce: z.boolean(),
    parryable: z.boolean(),
    reflectable: z.boolean(),
    homingPerTick: integer,
    homingMax: integer,
    hit,
    leadTicks: integer.optional(),
    cancelsProjectiles: z.boolean().optional(),
  })
  .strict();
const move = z.discriminatedUnion('type', [
  z
    .object({
      ...baseMove,
      type: z.literal('melee'),
      active: positive,
      reach: positive,
      half: angle,
      hit,
      hits: positive.max(31),
      hitEvery: positive,
      lunge: integer,
      armorFrom: z.number().int().min(-1),
      armorTo: z.number().int().min(-1),
      next: moveId.nullable(),
      chainFrom: integer,
      parry: z.enum(['counter', 'crush']),
      armorBreak: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...baseMove,
      type: z.literal('shot'),
      projectile,
      count: positive.max(8),
      spread: angle,
    })
    .strict(),
  z
    .object({
      ...baseMove,
      type: z.literal('draw'),
      quickAt: positive,
      fullAt: positive,
      quick: moveId,
      full: moveId,
    })
    .strict(),
  z
    .object({
      ...baseMove,
      type: z.literal('parry'),
      active: positive,
      half: angle,
      counter: moveId,
      reflectPower: integer,
      refundOnParry: z.boolean(),
      stagger: integer,
    })
    .strict(),
  z
    .object({
      ...baseMove,
      type: z.literal('rune'),
      distance: integer,
      assistRange: integer,
      radius: positive,
      arm: integer,
      active: positive,
      hit,
      holdTicks: integer,
      armorBreak: z.boolean(),
    })
    .strict(),
]);
const dash = z
  .object({
    ticks: positive,
    fastTicks: integer,
    fastSpeed: z.number().nonnegative(),
    slowSpeed: z.number().nonnegative(),
    iframeFrom: positive,
    iframeTo: integer,
    cancelFrom: integer,
    cooldown: integer,
    charges: positive,
    backward: z.boolean(),
    superArmor: z.boolean(),
    invisible: z.boolean(),
    contact: hit.nullable(),
    contactReach: integer,
  })
  .strict();
const arena = z.object({ w: positive, h: positive }).strict();
const triple = z.tuple([positive, positive, positive]);
const idleRange = z.tuple([positive, positive]).refine(([lo, hi]) => lo <= hi);
const commonDragonMove = { telegraph: positive, active: positive, recovery: integer };

/** Validate merged rules before they can replace an active environment. */
export const CombatRulesSchema = z
  .object({
    version: z.string().min(1),
    tickHz: z.literal(COMBAT_TICK_HZ),
    arena: z.object({ duel: arena, dragonFight: arena }).strict(),
    duelGap: integer,
    timeLimit: z.object({ duel: positive, dragonFight: positive }).strict(),
    inputBuffer: positive,
    body: z.object({ hurtRadius: positive, bodyRadius: positive }).strict(),
    accelTicks: positive,
    stopTicks: positive,
    aimAssist: z.object({ half: angle, rangePct: integer }).strict(),
    damage: z
      .object({
        sNum: integer,
        sDen: positive,
        k: positive,
        min: integer,
        dragonDamageTakenScale: z.number().nonnegative(),
        dragonDamageDealtScale: z.number().nonnegative(),
      })
      .strict(),
    hitstop: z
      .object({
        light: integer,
        multiHit: integer,
        normal: integer,
        heavy: integer,
        lightMaxPower: integer,
        heavyMinPower: integer,
        parry: integer,
        rageBonus: integer,
        weakPointBonus: integer,
        lastStand: integer,
        cap: integer,
      })
      .strict(),
    wallSlamStun: integer,
    dashStale: z.object({ window: positive, delay: integer, max: integer }).strict(),
    backstabHalf: angle,
    passives: z
      .object({
        archerFirstStrikeBonus: integer,
        mageDefDivisor: positive,
        ninjaEvadeEvery: positive,
        berserkerRageNum: positive,
        berserkerRageDen: positive,
        lastStandIframes: integer,
      })
      .strict(),
    ring: z
      .object({
        startTick: integer,
        endTick: positive,
        startRadius: positive,
        endRadius: positive,
        damage: integer,
        every: positive,
        push: integer,
      })
      .strict(),
    jobs: z.record(
      z.enum(JOB_IDS),
      z
        .object({
          speed: integer,
          attack: moveId,
          skill: moveId,
          skillCooldown: integer,
          skillCharges: positive,
          dash: dashId,
          backstabPct: integer,
          poisePct: integer,
        })
        .strict(),
    ),
    moves: z.record(moveId, move),
    dashes: z.record(dashId, dash),
    dragon: z
      .object({
        hpMultiplier: z.number().positive(),
        atkMultiplier: z.number().nonnegative(),
        body: z
          .array(z.object({ dx: z.number().int(), dy: z.number().int(), r: positive }).strict())
          .min(1),
        head: z.object({ forward: integer, r: positive }).strict(),
        anchorY: integer,
        playerDistance: integer,
        driftSpeed: integer,
        returnSpeed: positive,
        idle: z.tuple([idleRange, idleRange, idleRange]),
        firstIdle: positive,
        softEnrageTick: integer,
        softEnrageIdleNum: positive,
        softEnrageIdleDen: positive,
        phase2Pct: positive.max(100),
        phase3Pct: positive.max(100),
        roarTicks: positive,
        postRoarIdle: positive,
        p2TelegraphPct: positive,
        p3RecoveryPct: positive,
        breathEvery: positive,
        weakPointNum: positive,
        weakPointDen: positive,
        bands: z.object({ frontHalf: angle, frontRange: positive, sideRange: positive }).strict(),
        weights: z
          .object({
            front: z
              .object({
                claw: integer,
                volley: integer,
                charge: integer,
                gust: integer,
                dive: integer,
              })
              .strict(),
            side: z
              .object({
                tail: integer,
                volley: integer,
                charge: integer,
                gust: integer,
                dive: integer,
              })
              .strict(),
            far: z
              .object({ volley: integer, charge: integer, gust: integer, dive: integer })
              .strict(),
          })
          .strict(),
        claw: z
          .object({ ...commonDragonMove, reach: positive, half: angle, hit: dragonHit })
          .strict(),
        tail: z
          .object({ ...commonDragonMove, reach: positive, half: angle, hit: dragonHit })
          .strict(),
        volley: z
          .object({
            interval: positive,
            count: triple,
            arm: positive,
            blast: positive,
            radius: positive,
            recovery: integer,
            hit: dragonHit,
            floorFromPhase: positive.max(3),
            floorTicks: positive,
            floorEvery: positive,
            floorPower: integer,
          })
          .strict(),
        charge: z
          .object({
            telegraph: positive,
            lockBefore: integer,
            halfWidth: positive,
            speed: positive,
            maxTicks: positive,
            stun: positive,
            hit: dragonHit,
          })
          .strict(),
        gust: z
          .object({ telegraph: positive, active: positive, push: integer, reach: positive })
          .strict(),
        breath: z
          .object({
            telegraph: triple,
            active: positive,
            every: positive,
            reach: positive,
            half: angle,
            sweep: angle,
            recovery: integer,
            power: integer,
          })
          .strict(),
        dive: z
          .object({
            airborne: positive,
            lockBefore: integer,
            radius: positive,
            active: positive,
            recovery: integer,
            hit: dragonHit,
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((rules, ctx) => {
    const invalid = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    for (const [kind, size] of Object.entries(rules.arena)) {
      if (Math.min(size.w, size.h) <= 2 * rules.body.bodyRadius)
        invalid(['arena', kind], 'arena must fit the fighter body');
    }
    if (rules.duelGap > rules.arena.duel.w - 2 * rules.body.bodyRadius)
      invalid(['duelGap'], 'duel spawns must fit in the arena');
    if (
      rules.dragon.anchorY + rules.dragon.playerDistance >
      rules.arena.dragonFight.h - rules.body.bodyRadius
    )
      invalid(['dragon', 'playerDistance'], 'dragon challenger spawn must fit in the arena');
    if (rules.ring.startTick >= rules.ring.endTick || rules.ring.endRadius > rules.ring.startRadius)
      invalid(['ring'], 'ring must shrink over a positive interval');
    if (rules.dragon.phase3Pct >= rules.dragon.phase2Pct)
      invalid(['dragon', 'phase3Pct'], 'phase 3 must follow phase 2');
    for (const [id, kit] of Object.entries(rules.jobs)) {
      if (rules.moves[kit.skill].type === 'draw')
        invalid(['jobs', id, 'skill'], 'a skill must have a finite duration');
    }
    for (const [id, spec] of Object.entries(rules.moves)) {
      if (spec.type === 'draw') {
        if (spec.quickAt > spec.fullAt)
          invalid(['moves', id, 'fullAt'], 'full draw must follow quick draw');
        for (const key of ['quick', 'full'] as const)
          if (rules.moves[spec[key]].type !== 'shot')
            invalid(['moves', id, key], 'bow release must reference a shot');
      }
      if (spec.type === 'parry' && rules.moves[spec.counter].type !== 'melee')
        invalid(['moves', id, 'counter'], 'parry counter must reference a melee move');
    }
    for (const [id, spec] of Object.entries(rules.dashes)) {
      if (spec.fastTicks > spec.ticks)
        invalid(['dashes', id, 'fastTicks'], 'fast ticks cannot outlast the dash');
    }
  });
