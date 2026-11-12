import { DEFAULT_COMBAT_RULES, type CombatEvent } from '@dragon-rush/combat';
import { DEFAULT_RULES } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { fightFxFor, type FightFxContext } from '../src/combat/fightFx';
import { createSpeedLineBurst, SPEED_LINE_COOLDOWN_MS } from '../src/fx/core/speedLines';
import { fxForEvent, type FxEventContext } from '../src/fx/eventFx';
import { ArenaFx } from '../src/fx/runtime/arenaFx';
import { DEFAULT_FX_SETTINGS, resolveFxPolicy } from '../src/fx/settings/fxSettings';

const fight: FightFxContext = {
  kind: 'duel',
  rules: DEFAULT_COMBAT_RULES,
  origin: { x: 80, y: 74 },
  localSides: ['a'],
};

const board: FxEventContext = {
  controllable: [0],
  speed: 1,
  combat: null,
  maxHpOf: () => 40,
  toneOf: () => null,
  boardSize: DEFAULT_RULES.board.length,
};

const cueTypes = (event: CombatEvent, context = fight) =>
  fightFxFor(event, context).flatMap((command) => (command.type === 'cues' ? command.cues : []));

describe('brief motion accents', () => {
  it('expires on the wall clock and repeated actions leave a quiet gap', () => {
    let now = 0;
    const lines = createSpeedLineBurst(() => now);
    lines.trigger(0.9);
    expect(lines.sample()).toEqual({ progress: 0, strength: 0.9 });
    now = 90;
    lines.trigger(1);
    expect(lines.sample()).toEqual({ progress: 0.5, strength: 0.9 });
    now = 180;
    expect(lines.sample()).toBeNull();
    lines.trigger(0.7);
    expect(lines.sample()).toBeNull();
    now = SPEED_LINE_COOLDOWN_MS;
    lines.trigger(0.7);
    expect(lines.sample()).toEqual({ progress: 0, strength: 0.7 });
    lines.reset();
    expect(lines.sample()).toBeNull();
  });

  it('removes the streaks for reduced motion and while a hostile telegraph fills', () => {
    let now = 0;
    let reduceMotion = false;
    let strokes = 0;
    const canvas = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => {
        strokes += 1;
      },
    } as unknown as CanvasRenderingContext2D;
    const arena = new ArenaFx({
      clock: { now: () => now, realNow: () => now },
      policy: () => resolveFxPolicy(DEFAULT_FX_SETTINGS, reduceMotion),
    });
    arena.speedLines(1);
    arena.draw(canvas);
    expect(strokes).toBe(5);
    arena.setTelegraph(true);
    now = 30;
    arena.draw(canvas);
    expect(strokes).toBe(5);
    arena.setTelegraph(false);
    reduceMotion = true;
    arena.draw(canvas);
    expect(strokes).toBe(5);
  });

  it('marks strong attacks and shoulder charges, while routine attacks stay clear', () => {
    const attack = (move: 'greataxe' | 'slash1'): CombatEvent => ({
      id: `1:AttackStart:${move}`,
      tick: 1,
      type: 'AttackStart',
      who: 'a',
      move,
      dir: 0,
      pos: { x: 0, y: 0 },
    });
    expect(cueTypes(attack('greataxe'))).toContainEqual({ type: 'speedLines', strength: 0.7 });
    expect(cueTypes(attack('slash1')).some((cue) => cue.type === 'speedLines')).toBe(false);
    const charge: CombatEvent = {
      id: '2:Dash:a',
      tick: 2,
      type: 'Dash',
      who: 'a',
      dash: 'shoulderCharge',
      dir: 0,
      pos: { x: 0, y: 0 },
    };
    expect(cueTypes(charge)).toContainEqual({ type: 'speedLines', strength: 1 });
    expect(cueTypes(attack('greataxe'), { ...fight, replay: true })).toEqual([]);
  });

  it('labels every dragon warning independently of its color and sound', () => {
    for (const kind of [
      'claw',
      'tail',
      'volley',
      'charge',
      'gust',
      'breath',
      'dive',
      'meteor',
      'fireball',
    ] as const) {
      const event: CombatEvent = {
        id: `3:TelegraphStart:${kind}`,
        tick: 3,
        type: 'TelegraphStart',
        entity: 1,
        kind,
        shape: { kind: 'circle', x: 0, y: 0, r: 40 },
        ticks: 30,
      };
      expect(cueTypes(event).some((cue) => cue.type === 'caption' && cue.text.length > 0)).toBe(
        true,
      );
    }
  });

  it('accents board teleports at departure and arrival', () => {
    const cues = fxForEvent(
      { type: 'Moved', seat: 0, from: 20, to: 7, steps: 11, via: 'teleport' },
      board,
    );
    const lines = cues.filter((cue) => cue.type === 'speedLines');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.delayMs).toBeUndefined();
    expect(lines[1]?.delayMs).toBeGreaterThan(0);
  });
});
