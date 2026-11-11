import {
  applyAction,
  createGameWithEvents,
  DEFAULT_RULES,
  getLegalActions,
  type GameEvent,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { fxForEvent, trackCombat, type CombatSides, type FxEventContext } from '../src/fx/eventFx';
import { hitStopMs, hitStrength } from '../src/fx/recipes';
import type { FxCue } from '../src/fx/types';
import { tileTone } from '../src/types/tileView';

const ctx = (patch: Partial<FxEventContext> = {}): FxEventContext => ({
  controllable: [0],
  speed: 1,
  combat: null,
  maxHpOf: (ref) => (ref === 'dragon' ? 115 : 40),
  toneOf: (t) => tileTone(DEFAULT_RULES.board[t]!),
  boardSize: 24,
  ...patch,
});

const ofType = <T extends FxCue['type']>(cues: readonly FxCue[], type: T) =>
  cues.filter((c): c is Extract<FxCue, { type: T }> => c.type === type);
const sounds = (cues: readonly FxCue[]) => ofType(cues, 'sound').map((c) => c.name);

type HitEvent = Extract<GameEvent, { type: 'CombatHit' }>;
const hit = (patch: Partial<HitEvent> = {}): HitEvent => ({
  type: 'CombatHit',
  kind: 'duel',
  attacker: 0,
  defender: 1,
  roll: 4,
  damage: 5,
  evaded: false,
  breath: false,
  rage: false,
  firstStrike: false,
  hpAfter: 20,
  ...patch,
});

describe('event → effect mapping', () => {
  it('DiceRolled: rattle now; clack, dust and trauma 0.32 when the die settles', () => {
    const cues = fxForEvent({ type: 'DiceRolled', seat: 0, value: 4 }, ctx());
    expect(ofType(cues, 'sound')).toEqual([
      expect.objectContaining({ name: 'dice_roll' }),
      expect.objectContaining({ name: 'dice_land', delayMs: 595 }),
    ]);
    expect(ofType(cues, 'shake')).toEqual([{ type: 'shake', trauma: 0.32, delayMs: 595 }]);
    expect(ofType(cues, 'burst')[0]).toMatchObject({ preset: 'landDust', at: { kind: 'dice' } });
    const fast = fxForEvent({ type: 'DiceRolled', seat: 0, value: 4 }, ctx({ speed: 2 }));
    expect(ofType(fast, 'shake')[0]?.delayMs).toBe(298);
  });

  it('Moved (dice): a dust puff per hop, rising step ticks, a landing puff and tile glow', () => {
    const e: GameEvent = { type: 'Moved', seat: 0, from: 22, to: 1, steps: 3, via: 'dice' };
    const cues = fxForEvent(e, ctx());
    const dust = ofType(cues, 'burst').filter((c) => c.preset === 'dust');
    expect(dust.map((c) => c.at)).toEqual([
      { kind: 'tile', tile: 23 },
      { kind: 'tile', tile: 0 },
      { kind: 'tile', tile: 1 },
    ]);
    const delays = dust.map((c) => c.delayMs ?? 0);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(3);
    const steps = ofType(cues, 'sound').filter((c) => c.name === 'move_step');
    expect(steps.map((c) => c.semitones)).toEqual([0, 1, 2]);
    expect(sounds(cues)).toContain('land');
    expect(ofType(cues, 'punch')).toEqual([
      expect.objectContaining({ kind: 'glow', at: { kind: 'tile', tile: 1 } }),
    ]);
  });

  it('Moved (teleport): magic at both ends and trauma 0.35', () => {
    const cues = fxForEvent(
      { type: 'Moved', seat: 0, from: 3, to: 15, steps: 0, via: 'teleport' },
      ctx(),
    );
    expect(ofType(cues, 'shake')[0]?.trauma).toBe(0.35);
    expect(sounds(cues)).toEqual(['magic']);
    expect(ofType(cues, 'burst').map((c) => c.at)).toEqual([
      { kind: 'tile', tile: 3 },
      { kind: 'tile', tile: 15 },
    ]);
  });

  it('StartBonus: coins fly from the pawn to its HUD counter, plus heal sparkles', () => {
    const cues = fxForEvent(
      { type: 'StartBonus', seat: 2, coins: 10, hp: 6, coinsAfter: 20, hpAfter: 40 },
      ctx(),
    );
    expect(ofType(cues, 'coins')).toEqual([
      expect.objectContaining({
        from: { kind: 'seat', seat: 2 },
        to: { kind: 'hud', seat: 2, slot: 'coins' },
        coins: 10,
      }),
    ]);
    expect(ofType(cues, 'text').map((c) => [c.kind, c.value])).toEqual([
      ['coin', 10],
      ['heal', 6],
    ]);
    expect(ofType(cues, 'burst').map((c) => c.preset)).toContain('heal');
    // Coins are voiced by their arrivals; only the heal has a cue here.
    expect(sounds(cues)).toEqual(['heal']);
  });

  it('TileResolved: good tiles glow and sparkle, bad tiles wobble, smoke and shake 0.45', () => {
    const goodIndex = DEFAULT_RULES.board.findIndex((t) => tileTone(t) === 'good');
    const badIndex = DEFAULT_RULES.board.findIndex((t) => tileTone(t) === 'bad');
    const good = fxForEvent(
      {
        type: 'TileResolved',
        seat: 0,
        tile: goodIndex,
        tileId: DEFAULT_RULES.board[goodIndex]!.id,
      },
      ctx(),
    );
    expect(ofType(good, 'burst').map((c) => c.preset)).toEqual(['goldSparkle']);
    expect(sounds(good)).toEqual(['chime']);
    const bad = fxForEvent(
      { type: 'TileResolved', seat: 0, tile: badIndex, tileId: DEFAULT_RULES.board[badIndex]!.id },
      ctx(),
    );
    expect(ofType(bad, 'shake')[0]?.trauma).toBe(0.45);
    expect(ofType(bad, 'punch')[0]?.kind).toBe('wobble');
    expect(ofType(bad, 'burst').map((c) => c.preset)).toEqual(['smokeDark']);
    expect(sounds(bad)).toEqual(['thud']);
  });

  it('EffectApplied: numbers and particles per effect kind', () => {
    const coinsUp = fxForEvent(
      { type: 'EffectApplied', seat: 0, effect: 'coins', delta: 4, after: 9 },
      ctx(),
    );
    expect(ofType(coinsUp, 'coins')[0]?.coins).toBe(4);
    const coinsDown = fxForEvent(
      { type: 'EffectApplied', seat: 0, effect: 'coins', delta: -3, after: 1 },
      ctx(),
    );
    expect(ofType(coinsDown, 'text')[0]).toMatchObject({ kind: 'loss', value: 3 });
    expect(ofType(coinsDown, 'burst')[0]?.preset).toBe('coinDrop');
    const heal = fxForEvent(
      { type: 'EffectApplied', seat: 0, effect: 'hp', delta: 8, after: 30 },
      ctx(),
    );
    expect(ofType(heal, 'text')[0]).toMatchObject({ kind: 'heal', value: 8 });
    expect(sounds(heal)).toEqual(['heal']);
    const hurtMine = fxForEvent(
      { type: 'EffectApplied', seat: 0, effect: 'hp', delta: -5, after: 25 },
      ctx(),
    );
    expect(ofType(hurtMine, 'vignette')[0]?.tone).toBe('red');
    const hurtOther = fxForEvent(
      { type: 'EffectApplied', seat: 1, effect: 'hp', delta: -5, after: 25 },
      ctx(),
    );
    expect(ofType(hurtOther, 'vignette')).toEqual([]);
    const stat = fxForEvent(
      { type: 'EffectApplied', seat: 0, effect: 'stat', stat: 'def', delta: 1, after: 6 },
      ctx(),
    );
    expect(ofType(stat, 'text')[0]?.text).toBe('방어력 +1');
    expect(sounds(stat)).toEqual(['upgrade']);
  });

  describe('CombatHit', () => {
    const sides: CombatSides = { a: 0, b: 1 };

    it('hit-stops 40–90 ms by strength, divided by the animation speed', () => {
      for (const damage of [1, 4, 8, 12, 30]) {
        const cues = fxForEvent(hit({ damage }), ctx({ combat: sides }));
        const ms = ofType(cues, 'hitStop')[0]!.ms;
        expect(ms).toBeGreaterThanOrEqual(40);
        expect(ms).toBeLessThanOrEqual(90);
        expect(ms).toBe(hitStopMs(hitStrength(damage, 40)));
        const fast = fxForEvent(hit({ damage }), ctx({ combat: sides, speed: 4 }));
        expect(ofType(fast, 'hitStop')[0]!.ms).toBe(Math.round(ms / 4));
      }
    });

    it('scales trauma, sparks and the number with the hit and flashes only on big hits', () => {
      const light = fxForEvent(hit({ damage: 3 }), ctx({ combat: sides }));
      expect(ofType(light, 'shake')[0]?.trauma).toBe(0.2);
      expect(ofType(light, 'burst')[0]?.preset).toBe('sparkLight');
      expect(ofType(light, 'flash')).toEqual([]);
      expect(ofType(light, 'text')[0]).toMatchObject({
        kind: 'damage',
        value: 3,
        target: 'combatant:1',
      });
      const big = fxForEvent(hit({ damage: 12 }), ctx({ combat: sides }));
      expect(ofType(big, 'shake')[0]?.trauma).toBe(0.35);
      expect(ofType(big, 'burst')[0]?.preset).toBe('sparkHeavy');
      expect(ofType(big, 'flash')[0]?.alpha).toBeLessThanOrEqual(0.3);
      expect(ofType(big, 'text')[0]?.kind).toBe('heavy');
      // Anchored on the defender's fighter card, sparks fly away from the attacker.
      expect(ofType(big, 'burst')[0]).toMatchObject({
        at: { kind: 'combatant', ref: 1, side: 'b' },
        angle: 0,
      });
      const back = fxForEvent(hit({ attacker: 1, defender: 0 }), ctx({ combat: sides }));
      expect(ofType(back, 'burst')[0]?.angle).toBe(Math.PI);
      expect(sounds(big)).toEqual(['attack_hit']);
    });

    it('dragon-on-player hits use the hostile trauma, breath adds embers, the local player sees red', () => {
      const cues = fxForEvent(
        hit({ kind: 'dragonFight', attacker: 'dragon', defender: 0, damage: 15, breath: true }),
        ctx({ combat: { a: 0, b: 'dragon' } }),
      );
      expect(ofType(cues, 'shake')[0]?.trauma).toBe(0.5);
      expect(ofType(cues, 'burst').map((c) => c.preset)).toContain('embers');
      expect(ofType(cues, 'vignette')[0]?.tone).toBe('red');
      expect(sounds(cues)).toEqual(['dragon_breath']);
    });

    it('evades show 회피 with a whoosh and no impact', () => {
      const cues = fxForEvent(hit({ damage: 0, evaded: true }), ctx({ combat: sides }));
      expect(ofType(cues, 'text')[0]?.text).toBe('회피');
      expect(ofType(cues, 'hitStop')).toEqual([]);
      expect(ofType(cues, 'shake')).toEqual([]);
      expect(sounds(cues)).toEqual(['swing']);
    });
  });

  it('PlayerEliminated: trauma 0.63, KO boss stop, smoke, duck', () => {
    const cues = fxForEvent(
      { type: 'PlayerEliminated', seat: 1, by: 0, round: 4 },
      ctx({ combat: { a: 0, b: 1 } }),
    );
    expect(ofType(cues, 'shake')[0]?.trauma).toBe(0.63);
    expect(ofType(cues, 'bossStop')[0]).toMatchObject({
      freezeMs: 350,
      slowFactor: 0.3,
      slowMs: 700,
      rampMs: 200,
    });
    expect(ofType(cues, 'burst')[0]).toMatchObject({
      preset: 'smokeKo',
      at: { kind: 'combatant', ref: 1, side: 'b' },
    });
    expect(ofType(cues, 'duck')).toHaveLength(1);
    expect(sounds(cues)).toEqual(['eliminate']);
  });

  it('Shield, purchases, upgrades and theft', () => {
    const shield = fxForEvent({ type: 'ShieldUsed', seat: 1, against: 0 }, ctx());
    expect(ofType(shield, 'burst')[0]?.preset).toBe('shield');
    expect(sounds(shield)).toEqual(['shield']);
    const buy = fxForEvent(
      { type: 'ItemBought', seat: 0, item: 'teleport', price: 6, coinsAfter: 4 },
      ctx(),
    );
    expect(ofType(buy, 'text')[0]).toMatchObject({
      kind: 'loss',
      value: 6,
      at: { kind: 'hud', seat: 0, slot: 'coins' },
    });
    expect(sounds(buy)).toEqual(['buy']);
    const up = fxForEvent(
      {
        type: 'StatUpgraded',
        seat: 0,
        stat: 'atk',
        cost: 3,
        free: false,
        valueAfter: 6,
        levelAfter: 1,
        coinsAfter: 2,
      },
      ctx(),
    );
    expect(ofType(up, 'punch')[0]).toMatchObject({
      kind: 'pop',
      at: { kind: 'hud', seat: 0, slot: 'panel' },
    });
    expect(sounds(up)).toEqual(['upgrade']);
    const stolen = fxForEvent({ type: 'CoinsStolen', from: 1, to: 0, amount: 7 }, ctx());
    expect(ofType(stolen, 'coins')[0]).toMatchObject({
      from: { kind: 'seat', seat: 1 },
      to: { kind: 'hud', seat: 0, slot: 'coins' },
    });
  });

  it('CombatStarted: trauma 0.55, a governed clash flash and a roar for the dragon', () => {
    const duel = fxForEvent({ type: 'CombatStarted', kind: 'duel', a: 0, b: 1, first: 0 }, ctx());
    expect(ofType(duel, 'shake')[0]?.trauma).toBe(0.55);
    expect(ofType(duel, 'flash')[0]).toMatchObject({ alpha: 0.3, ms: 80 });
    const dragon = fxForEvent(
      { type: 'CombatStarted', kind: 'dragonFight', a: 0, b: 'dragon', first: 0 },
      ctx(),
    );
    expect(sounds(dragon)).toEqual(['dragon_roar']);
  });

  it('GameEnded: confetti and a fanfare for a local (or spectated) win, gloom otherwise', () => {
    const win = fxForEvent({ type: 'GameEnded', outcome: { kind: 'dragon', winner: 0 } }, ctx());
    expect(ofType(win, 'burst').filter((c) => c.preset === 'confetti')).toHaveLength(2);
    expect(sounds(win)).toEqual(['victory']);
    const lose = fxForEvent(
      { type: 'GameEnded', outcome: { kind: 'lastSurvivor', winner: 1 } },
      ctx(),
    );
    expect(ofType(lose, 'burst')).toEqual([]);
    expect(ofType(lose, 'vignette')[0]?.tone).toBe('dark');
    expect(sounds(lose)).toEqual(['defeat']);
    const spectated = fxForEvent(
      { type: 'GameEnded', outcome: { kind: 'lastSurvivor', winner: 1 } },
      ctx({ controllable: [] }),
    );
    expect(sounds(spectated)).toEqual(['victory']);
  });

  it('tracks the fight on screen', () => {
    let sides = trackCombat(null, { type: 'CombatStarted', kind: 'duel', a: 2, b: 0, first: 2 });
    expect(sides).toEqual({ a: 2, b: 0 });
    sides = trackCombat(sides, hit());
    expect(sides).toEqual({ a: 2, b: 0 });
    expect(trackCombat(sides, { type: 'TurnEnded', seat: 2 })).toBeNull();
  });

  it('maps every event of a seeded full game within the safety limits', () => {
    const created = createGameWithEvents(
      { seats: [{ job: 'berserker' }, { job: 'ninja' }, { job: 'archer' }, { job: 'swordsman' }] },
      { ...DEFAULT_RULES, maxRounds: 40 },
      11,
    );
    let state = created.state;
    const all: GameEvent[] = [...created.events];
    for (let i = 0; i < 4000 && state.pending; i++) {
      const legal = getLegalActions(state);
      const calm = legal.filter((a) => a.type !== 'CHALLENGE_DRAGON');
      const pool = calm.length > 0 ? calm : legal;
      const action = pool[i % pool.length]!;
      const r = applyAction(state, action);
      state = r.state;
      all.push(...r.events);
    }
    let combat: CombatSides | null = null;
    const types = new Set<string>();
    for (const e of all) {
      combat = trackCombat(combat, e);
      for (const speed of [1, 4]) {
        const cues = fxForEvent(e, ctx({ combat, speed }));
        for (const c of cues) {
          types.add(c.type);
          expect(c.delayMs ?? 0).toBeGreaterThanOrEqual(0);
          if (c.type === 'hitStop') expect(c.ms).toBeLessThanOrEqual(90);
          if (c.type === 'flash') expect(c.alpha).toBeLessThanOrEqual(0.3);
          if (c.type === 'shake') expect(c.trauma).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(all.some((e) => e.type === 'CombatHit')).toBe(true);
    for (const t of ['sound', 'burst', 'text', 'shake', 'coins', 'hitStop', 'punch'])
      expect(types).toContain(t);
  });
});
