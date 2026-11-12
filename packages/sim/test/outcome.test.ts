import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_COMBAT_RULES, policyRandom, runCombat } from '@dragon-rush/combat';
import { createCombatBotByName } from '@dragon-rush/combat-ai';
import { createRng, DEFAULT_RULES, nextFloat } from '@dragon-rush/engine';
import { emptyOutcomeModel } from '@dragon-rush/ai';
import {
  generateOutcomeRows,
  fitOutcomeModel,
  outcomeCalibration,
  sampleOutcomeResult,
} from '../src/outcome';
import { StatDistSchema } from '../src/statDist';
import { EnvServer } from '../src/env/envServer';

const fixture = StatDistSchema.parse({
  version: 'stat_dist_v1',
  rules_version: DEFAULT_RULES.version,
  fighters: [
    {
      kind: 'duel',
      job: 'swordsman',
      hp: 20,
      maxHp: 25,
      atk: 6,
      def: 5,
      indomitableAvailable: true,
    },
    { kind: 'duel', job: 'mage', hp: 19, maxHp: 19, atk: 7, def: 3, indomitableAvailable: false },
    {
      kind: 'dragonFight',
      job: 'archer',
      hp: 28,
      maxHp: 30,
      atk: 9,
      def: 6,
      indomitableAvailable: false,
    },
  ],
});

describe('outcome pipeline', () => {
  it('generates seeded rows from real 60Hz fights', () => {
    const a = generateOutcomeRows(fixture, { seed: 12, count: 12 });
    expect(a).toEqual(generateOutcomeRows(fixture, { seed: 12, count: 12 }));
    expect(a).toHaveLength(12);
    expect(a.some((r) => r.setup.kind === 'dragonFight')).toBe(true);
    expect(
      a.every(
        (r) => (r.ticks > 0 && r.result.winner === 'a') || (r.ticks > 0 && r.result.winner === 'b'),
      ),
    ).toBe(true);
  });

  it('preserves actual board fight pairs and the per-tick scripted bot cadence', () => {
    const setup = {
      kind: 'duel' as const,
      a: {
        job: 'swordsman' as const,
        hp: 21,
        maxHp: 25,
        atk: 8,
        def: 5,
        indomitableAvailable: true,
      },
      b: { job: 'mage' as const, hp: 18, maxHp: 19, atk: 9, def: 4, indomitableAvailable: false },
    };
    const paired = StatDistSchema.parse({ ...fixture, setups: [setup] });
    const row = generateOutcomeRows(paired, { seed: 12, count: 1 })[0]!;
    expect(row.setup).toEqual(setup);
    let rng = createRng(12);
    [, rng] = nextFloat(rng); // select the sole setup
    const [seedDraw] = nextFloat(rng);
    const seed = Math.floor(seedDraw * 0x1_0000_0000);
    const expected = runCombat(
      setup,
      [
        createCombatBotByName('scripted:balanced', policyRandom(seed, 3)),
        createCombatBotByName('scripted:balanced', policyRandom(seed, 4)),
      ],
      seed,
      DEFAULT_COMBAT_RULES,
      { decisionInterval: 1 },
    );
    expect({ result: row.result, ticks: row.ticks }).toEqual(expected);
    expect(() =>
      StatDistSchema.parse({ ...fixture, setups: [{ ...setup, a: { ...setup.a, hp: 26 } }] }),
    ).toThrow();
  });

  it('fits reproducibly and reports holdout reliability', () => {
    const rows = generateOutcomeRows(fixture, { seed: 3, count: 36 });
    const a = fitOutcomeModel(rows, {
      seed: 17,
      epochs: 5,
      id: 'fixture',
      rulesVersion: DEFAULT_RULES.version,
      combatRulesVersion: DEFAULT_COMBAT_RULES.version,
    });
    expect(a).toEqual(
      fitOutcomeModel(rows, {
        seed: 17,
        epochs: 5,
        id: 'fixture',
        rulesVersion: DEFAULT_RULES.version,
        combatRulesVersion: DEFAULT_COMBAT_RULES.version,
      }),
    );
    const report = outcomeCalibration(a.model, a.holdout);
    expect(report.count).toBeGreaterThan(0);
    expect(report.brier).toBeGreaterThanOrEqual(0);
    expect(report.deciles).toHaveLength(10);
    expect(a.model.training.samples).toBe(
      rows.length - a.holdout.length - (a.model.training.calibration_samples ?? 0),
    );
  });

  it('gates holdout calibration by predicted-probability deciles', () => {
    const model = emptyOutcomeModel(
      'fixture',
      DEFAULT_RULES.version,
      DEFAULT_COMBAT_RULES.version,
      {
        ...DEFAULT_COMBAT_RULES.damage,
        mageDefDivisor: DEFAULT_COMBAT_RULES.passives.mageDefDivisor,
      },
    );
    const setup = {
      kind: 'duel' as const,
      a: {
        job: 'swordsman' as const,
        hp: 10,
        maxHp: 10,
        atk: 5,
        def: 5,
        indomitableAvailable: true,
      },
      b: { job: 'mage' as const, hp: 10, maxHp: 10, atk: 5, def: 5, indomitableAvailable: false },
    };
    const rows = Array.from({ length: 100 }, (_, i) => ({
      setup,
      result: {
        winner: i % 2 === 0 ? ('a' as const) : ('b' as const),
        hpA: i % 2 === 0 ? 5 : 0,
        hpB: i % 2 === 0 ? 0 : 5,
      },
      ticks: 120,
    }));
    const pass = outcomeCalibration(model, rows);
    expect(pass.passes).toBe(true);
    expect(pass.deciles.every((d) => d.count === 10 && d.error === 0)).toBe(true);
    const fail = outcomeCalibration(
      model,
      rows.map((r) => ({ ...r, result: { winner: 'a' as const, hpA: 5, hpB: 0 } })),
    );
    expect(fail.passes).toBe(false);
    expect(fail.maxError).toBe(0.5);
  });

  it('samples valid winner HP and deterministic Last Stand flags', () => {
    const model = emptyOutcomeModel(
      'fixture',
      DEFAULT_RULES.version,
      DEFAULT_COMBAT_RULES.version,
      {
        ...DEFAULT_COMBAT_RULES.damage,
        mageDefDivisor: DEFAULT_COMBAT_RULES.passives.mageDefDivisor,
      },
    );
    const setup = {
      kind: 'dragonFight' as const,
      a: {
        job: 'swordsman' as const,
        hp: 15,
        maxHp: 25,
        atk: 5,
        def: 4,
        indomitableAvailable: true,
      },
      b: null,
      dragon: { hp: 88, atk: 7, def: 7 },
    };
    const run = () => {
      let rng = createRng(55);
      return Array.from({ length: 100 }, () => {
        const [result, next] = sampleOutcomeResult(model, setup, rng);
        rng = next;
        return result;
      });
    };
    expect(run()).toEqual(run());
    expect(
      run().every(
        (r) =>
          r.hpA >= 0 &&
          r.hpA <= setup.a.maxHp &&
          r.hpB === null &&
          (r.winner !== 'a' || r.hpA >= 1),
      ),
    ).toBe(true);
    for (let maxHp = 1; maxHp <= 12; maxHp++) {
      const duel = {
        kind: 'duel' as const,
        a: { ...setup.a, hp: Math.min(15, maxHp), maxHp },
        b: { ...setup.a, hp: 1, maxHp, indomitableAvailable: false },
      };
      let rng = createRng(maxHp);
      for (let i = 0; i < 100; i++) {
        const [r, next] = sampleOutcomeResult(model, duel, rng);
        rng = next;
        expect(r.winner === 'a' ? r.hpA : r.hpB).toBeGreaterThanOrEqual(1);
        expect(r.winner === 'a' ? r.hpA : r.hpB).toBeLessThanOrEqual(maxHp);
      }
    }
  });

  it('loads outcome_v1 in the board env and replays byte for byte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outcome-fixture-'));
    try {
      const path = join(dir, 'fixture.json');
      const model = emptyOutcomeModel(
        'fixture',
        DEFAULT_RULES.version,
        DEFAULT_COMBAT_RULES.version,
        {
          ...DEFAULT_COMBAT_RULES.damage,
          mageDefDivisor: DEFAULT_COMBAT_RULES.passives.mageDefDivisor,
        },
      );
      writeFileSync(path, JSON.stringify(model));
      const run = () => {
        const server = new EnvServer();
        const call = (id: number, cmd: string, params: object) =>
          JSON.parse(server.handle(JSON.stringify({ id, cmd, params })));
        let response = call(1, 'reset', {
          seed: 42,
          config: {
            mode: 'selfplay',
            num_players: 4,
            combat_resolver: 'outcome',
            outcome_model: path,
            return_events: true,
          },
          expect: { outcome_model_id: 'fixture' },
        });
        expect(response.ok).toBe(true);
        expect(response.result.outcome_model_id).toBe('fixture');
        const trace = [JSON.stringify(response)];
        for (let i = 0; i < 120; i++) {
          const legal = response.result.envs[0].legal as number[];
          response = call(i + 2, 'step', { actions: [legal[0]] });
          expect(response.ok).toBe(true);
          trace.push(JSON.stringify(response));
        }
        return trace;
      };
      expect(run()).toEqual(run());
      expect(run().join('')).toContain('CombatEnded');
      const bad = JSON.parse(
        new EnvServer().handle(
          JSON.stringify({
            id: 1,
            cmd: 'reset',
            params: { config: { combat_resolver: 'outcome' } },
          }),
        ),
      );
      expect(bad.result.outcome_model_id).toBe('outcome-v1-rush5-transfer');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs the CLI with a tiny stat_dist fixture and two generation workers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outcome-cli-'));
    try {
      const dist = join(dir, 'stat_dist.json');
      const model = join(dir, 'model.json');
      const report = join(dir, 'report.json');
      writeFileSync(dist, JSON.stringify(fixture));
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'packages/sim/src/outcome/cli.ts',
          '--stat-dist',
          dist,
          '--model',
          model,
          '--report',
          report,
          '--count',
          '20',
          '--seed',
          '5',
          '--epochs',
          '2',
          '--workers',
          '2',
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(requireText(model)).version).toBe('outcome_v1');
      expect(JSON.parse(requireText(report)).count).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function requireText(path: string): string {
  return readFileSync(path, 'utf8');
}
