import { DEFAULT_COMBAT_RULES, type CombatEvent, type CombatEventBody } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { fightFxFor, type FightFxCommand, type FightFxContext } from '../src/combat/fightFx';
import { FLOW_MS, finishMs, nextPhase, phaseMs } from '../src/combat/fightFlow';
import { GHOST_DRAIN_MS, GHOST_HOLD_MS, ghostAt, trackGhost } from '../src/combat/render/hudModel';
import { arenaRect, fitCanvas, VIEW_H, VIEW_W } from '../src/combat/render/layout';
import type { PendingFight } from '../src/services/gameClient';
import { fightCards, resultView } from '../src/types/fightView';

const ctx: FightFxContext = {
  kind: 'duel',
  rules: DEFAULT_COMBAT_RULES,
  origin: { x: 80, y: 74 },
  localSides: ['a'],
};

const ev = (body: CombatEventBody, tick = 10): CombatEvent => ({
  ...body,
  tick,
  id: `${tick}:${body.type}:k`,
});

const hit = (over: Partial<Extract<CombatEventBody, { type: 'Hit' }>> = {}): CombatEvent =>
  ev({
    type: 'Hit',
    attacker: 'b',
    target: 'a',
    dmg: 5,
    kind: 'slash1',
    dir: 0,
    pos: { x: 100, y: 200 },
    hpAfter: 30,
    knockback: 20,
    hitstun: 14,
    hitstop: 5,
    weakPoint: false,
    firstStrike: false,
    rage: false,
    pierce: false,
    backstab: false,
    ...over,
  });

const sounds = (cmds: FightFxCommand[]) =>
  cmds.flatMap((c) =>
    c.type === 'cues' ? c.cues.flatMap((q) => (q.type === 'sound' ? [q.name] : [])) : [],
  );

describe('sim event → effects', () => {
  it('a hit on the local fighter: sparks/number at chest height in canvas px, red edge, flinch', () => {
    const cmds = fightFxFor(hit(), ctx);
    const h = cmds.find((c) => c.type === 'hit');
    expect(h).toMatchObject({
      type: 'hit',
      x: 180,
      y: 274 - 22,
      damage: 5,
      kind: 'light',
      mine: true,
      sound: true,
    });
    expect(cmds).toContainEqual({ type: 'flinch', who: 'a', dir: 0, ticks: 5 });
  });

  it('classifies heavy hits by the sim hit-stop and dragon hits as hostile', () => {
    expect(
      fightFxFor(hit({ hitstop: 7, target: 'b', attacker: 'a' }), ctx).find(
        (c) => c.type === 'hit',
      ),
    ).toMatchObject({
      kind: 'heavy',
      mine: false,
    });
    const dragonCtx = { ...ctx, kind: 'dragonFight' as const };
    expect(
      fightFxFor(hit({ attacker: 'dragon', kind: 'claw', hitstop: 6 }), dragonCtx).find(
        (c) => c.type === 'hit',
      ),
    ).toMatchObject({
      kind: 'hostile',
    });
    // breath ticks: no impact sound per tick, flagged for embers
    expect(
      fightFxFor(hit({ attacker: 'dragon', kind: 'breath', hitstop: 0 }), dragonCtx).find(
        (c) => c.type === 'hit',
      ),
    ).toMatchObject({
      kind: 'light',
      breath: true,
      sound: false,
    });
  });

  it('parry, evade and Last Stand show their callouts', () => {
    expect(
      fightFxFor(
        ev({
          type: 'Parry',
          who: 'a',
          attacker: 'b',
          kind: 'slash1',
          pos: { x: 0, y: 0 },
          reflected: false,
        }),
        ctx,
      ),
    ).toEqual([expect.objectContaining({ type: 'hit', kind: 'parry', damage: 0 })]);
    expect(
      fightFxFor(
        ev({ type: 'Evade', who: 'a', attacker: 'b', kind: 'kunai', pos: { x: 0, y: 0 } }),
        ctx,
      ),
    ).toEqual([expect.objectContaining({ type: 'hit', evaded: true })]);
    const ls = fightFxFor(ev({ type: 'LastStand', who: 'a', pos: { x: 10, y: 10 } }), ctx);
    const cues = ls.flatMap((c) => (c.type === 'cues' ? c.cues : []));
    expect(cues).toContainEqual(
      expect.objectContaining({ type: 'text', kind: 'lastStand', text: '불굴!' }),
    );
    expect(cues).toContainEqual({ type: 'shake', trauma: 0.55 });
    expect(ls).toContainEqual({ type: 'zoom', amount: 0.05 });
  });

  it('KO: trauma, boss stop (presentation only), zoom punch and the fall', () => {
    const cmds = fightFxFor(ev({ type: 'KO', who: 'b', pos: { x: 0, y: 0 } }), ctx);
    const cues = cmds.flatMap((c) => (c.type === 'cues' ? c.cues : []));
    expect(cues).toContainEqual({ type: 'shake', trauma: 0.85 });
    expect(cues).toContainEqual(expect.objectContaining({ type: 'bossStop', freezeMs: 350 }));
    expect(cmds).toContainEqual({ type: 'ko', who: 'b' });
    const dragon = fightFxFor(ev({ type: 'KO', who: 'dragon', pos: { x: 0, y: 0 } }), {
      ...ctx,
      kind: 'dragonFight',
    });
    expect(dragon.flatMap((c) => (c.type === 'cues' ? c.cues : []))).toContainEqual({
      type: 'shake',
      trauma: 1,
    });
  });

  it('telegraphs and outcomes have their sounds; highlights drop the small move sounds', () => {
    const shape = { kind: 'arc' as const, x: 0, y: 0, r: 360, dir: 64, half: 18 };
    expect(
      sounds(
        fightFxFor(
          ev({ type: 'TelegraphStart', entity: 1, kind: 'breath', shape, ticks: 48 }),
          ctx,
        ),
      ),
    ).toEqual(['breath_charge']);
    expect(
      sounds(
        fightFxFor(ev({ type: 'TelegraphStart', entity: 1, kind: 'claw', shape, ticks: 30 }), ctx),
      ),
    ).toEqual(['telegraph']);
    const won = ev({ type: 'FightEnded', result: { winner: 'a', hpA: 3, hpB: 0 } });
    expect(sounds(fightFxFor(won, ctx))).toEqual(['victory']);
    expect(sounds(fightFxFor(won, { ...ctx, localSides: ['b'] }))).toEqual(['defeat']);
    const swing = ev({
      type: 'AttackStart',
      who: 'a',
      move: 'slash1',
      dir: 0,
      pos: { x: 0, y: 0 },
    });
    expect(sounds(fightFxFor(swing, ctx))).toEqual(['blade']);
    expect(fightFxFor(swing, { ...ctx, replay: true })).toEqual([]);
  });

  it('gives each melee and ranged job its own attack cue', () => {
    const cue = (move: 'slash1' | 'dagger1' | 'greataxe' | 'quickShot' | 'bolt' | 'kunai') =>
      sounds(
        fightFxFor(ev({ type: 'AttackStart', who: 'a', move, dir: 0, pos: { x: 0, y: 0 } }), ctx),
      );
    expect(cue('slash1')).toEqual(['blade']);
    expect(cue('dagger1')).toEqual(['dagger']);
    expect(cue('greataxe')).toEqual(['axe']);
    expect(cue('quickShot')).toEqual(['shot']);
    expect(cue('bolt')).toEqual(['magic']);
    expect(cue('kunai')).toEqual(['kunai']);
  });
});

describe('fight flow', () => {
  it('goes VS → READY → fight → KO beat → result → done; highlights skip READY', () => {
    expect(nextPhase('intro', false)).toBe('ready');
    expect(nextPhase('intro', true)).toBe('fight');
    expect(nextPhase('ready', false)).toBe('fight');
    expect(nextPhase('fight', false)).toBe('finish');
    expect(nextPhase('finish', false)).toBe('result');
    expect(nextPhase('result', false)).toBe('done');
    const o = { replay: false, kind: 'duel' as const, result: null };
    expect(phaseMs('intro', o)! + phaseMs('ready', o)!).toBe(2800);
    expect(phaseMs('fight', o)).toBeNull();
    expect(phaseMs('result', o)).toBe(FLOW_MS.result);
  });

  it('holds the KO beat for the boss stop (longer for the dragon)', () => {
    expect(finishMs('duel', { winner: 'a', hpA: 5, hpB: 0 })).toBe(350 + 700 + 200);
    expect(finishMs('dragonFight', { winner: 'a', hpA: 5, hpB: null })).toBe(500 + 1200 + 200);
    expect(finishMs('duel', { winner: 'a', hpA: 5, hpB: 4, timedOut: true })).toBe(FLOW_MS.timeUp);
  });
});

describe('HUD model', () => {
  it('ghost bar holds 400 ms then drains to the new HP', () => {
    let g = trackGhost(null, 50, 0);
    g = trackGhost(g, 40, 1000);
    expect(ghostAt(g, 1000 + GHOST_HOLD_MS - 1)).toBe(50);
    expect(ghostAt(g, 1000 + GHOST_HOLD_MS + GHOST_DRAIN_MS / 2)).toBeCloseTo(45);
    expect(ghostAt(g, 1000 + GHOST_HOLD_MS + GHOST_DRAIN_MS)).toBe(40);
    // a second hit mid-drain restarts the hold from the current ghost level
    const g2 = trackGhost(g, 30, 1000 + GHOST_HOLD_MS + GHOST_DRAIN_MS / 2);
    expect(g2.from).toBeCloseTo(45);
    expect(trackGhost(g2, 60, 5000)).toEqual({ value: 60, from: 60, since: 5000 });
  });

  it('fits 960×540 into any box and centres both arenas under the HUD band', () => {
    const fit = fitCanvas(1920, 1200, 2);
    expect(fit.cssW).toBe(1920);
    expect(fit.cssH).toBe(1080);
    expect(fit.pixelW).toBe(3840);
    expect(fit.scale).toBe(4);
    expect(fitCanvas(800, 800, 1).cssW).toBe(800);
    expect(arenaRect(800, 448)).toEqual({ x: 80, y: 74, w: 800, h: 448 });
    const d = arenaRect(896, 448);
    expect(d.x).toBe(32);
    // ≥ 29 px margin so a 1.06 zoom punch never crops the play area
    expect(Math.min(d.x, VIEW_W - d.x - d.w, VIEW_H - d.y - d.h)).toBeGreaterThanOrEqual(18);
  });
});

describe('fight view', () => {
  const fight: PendingFight = {
    id: 1,
    request: { kind: 'duel', a: 2, b: 0 },
    setup: {
      kind: 'duel',
      a: { job: 'archer', hp: 30, maxHp: 40, atk: 6, def: 6, indomitableAvailable: false },
      b: { job: 'swordsman', hp: 50, maxHp: 56, atk: 5, def: 5, indomitableAvailable: true },
    },
    seed: 9,
    sides: [
      { side: 'a', seat: 2, control: 'keyboard-solo' },
      { side: 'b', seat: 0, control: 'bot' },
    ],
    botLevel: 'normal',
    replay: null,
  };
  const seats = [
    { seat: 0, name: '봇', kind: 'bot' as const, connected: true, controlledBy: 'bot' as const },
    {
      seat: 2,
      name: '나',
      kind: 'human' as const,
      connected: true,
      controlledBy: 'human' as const,
    },
  ];

  it('names both sides with seat colour and crest', () => {
    const [a, b] = fightCards(fight, seats);
    expect(a).toMatchObject({ name: '나', job: 'archer', crest: 'leaf', hp: 30, maxHp: 40 });
    expect(b).toMatchObject({ name: '봇', job: 'swordsman', crest: 'shield', control: 'bot' });
  });

  it('result card: winner, HP left, Last Stand, loser eliminated', () => {
    const cards = fightCards(fight, seats);
    const v = resultView(cards, { winner: 'b', hpA: 0, hpB: 1, indomitableUsedB: true });
    expect(v.headline).toBe('봇 승리!');
    expect(v.good).toBe(false);
    expect(v.lines).toEqual(['봇 남은 HP 1 / 56', '불굴 발동!', '나 탈락']);
  });
});
