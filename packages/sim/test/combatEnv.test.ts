import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  createCombat,
  DEFAULT_COMBAT_RULES,
  NO_INPUT,
  stepCombat,
  type CombatState,
  type FighterInput,
  type FighterSetup,
  type Side,
} from '@dragon-rush/combat';
import { encodeCombatObservation, isActionable, toFighterInput } from '@dragon-rush/combat-ai';
import { describe, expect, it } from 'vitest';
import { CombatEnvServer, runBatch, statDistFromRecords } from '../src/index';

interface Outcome {
  winner: 0 | 1 | 'dragon';
  reason: string;
  hp: [number, number | null];
  last_stand_used: [boolean, boolean];
  dragon_hp?: number;
}
interface EpisodeStart {
  episode: number;
  jobs: [string, string | null];
  seed: number;
  // [a, b] in a duel, [a, dragon setup] in a dragon fight
  stats: FighterSetup[];
  mirror: { x: boolean; y: boolean };
  opponent: string | null;
  dragon_hp_scale?: number;
  telegraph_scale?: number;
}
/** Union of the result bodies used here (info and reset/step); only `ok` responses are read. */
interface ResultBody {
  envs: EnvOut[];
  n_ctrl: number;
  protocol: string;
  combat_rules_version: string;
  combat_rules_hash: number;
  obs_layout: { name: string; offset: number; length: number }[];
  action_names: { move: string[]; button: string[]; flat: string[] };
  bots: string[];
}
type Res = {
  id: number | null;
  ok: boolean;
  result: ResultBody;
  error?: { code: string; message: string; env_index?: number };
};
interface EnvOut {
  obs: (string | number[])[];
  move_mask?: number[][];
  button_mask?: number[][];
  mask?: number[][];
  rewards: number[];
  actionable: boolean[];
  active: boolean[];
  ticks_elapsed: number;
  tick: number;
  mode: 'pvp' | 'dragon';
  terminated: boolean;
  truncated: boolean;
  outcome: Outcome;
  final_obs: Record<string, string | number[]>;
  episode_start?: EpisodeStart;
}

const call = (s: CombatEnvServer, id: number, cmd: string, params?: object): Res =>
  JSON.parse(s.handle(JSON.stringify({ id, cmd, params })));

/** Small deterministic LCG so action streams are reproducible without Math.random. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const pick = (mask: number[], r: () => number): number => {
  const ok = mask.flatMap((v, i) => (v ? [i] : []));
  return ok[Math.floor(r() * ok.length)]!;
};

function randomActions(envs: EnvOut[], r: () => number, flat: boolean): unknown[] {
  return envs.map((e) =>
    flat
      ? e.mask!.map((m) => pick(m, r))
      : e.move_mask!.map((mm, slot) => [pick(mm, r), pick(e.button_mask![slot]!, r)]),
  );
}

describe('combat env server (in-process)', () => {
  it('reports protocol, versions, dims, layout and names', () => {
    const r = call(new CombatEnvServer(), 1, 'info').result;
    expect(r).toMatchObject({
      protocol: 'rpgboard-combat-env/1',
      cobs_version: 'cobs_v1',
      cact_version: 'cact_v1',
      cobs_dim: 160,
      cact_nvec: [9, 4],
      cact_flat_dim: 36,
      tick_hz: 60,
    });
    expect(typeof r.combat_rules_version).toBe('string');
    expect(typeof r.combat_rules_hash).toBe('number');
    expect(r.obs_layout.reduce((a: number, f: { length: number }) => a + f.length, 0)).toBe(160);
    expect(r.action_names.move).toHaveLength(9);
    expect(r.action_names.button).toHaveLength(4);
    expect(r.action_names.flat).toHaveLength(36);
    expect(r.bots).toContain('scripted:balanced');
  });

  it('rejects step before reset, unknown commands, bad JSON and bad configs', () => {
    const s = new CombatEnvServer();
    expect(call(s, 1, 'step', { actions: [] }).error?.code).toBe('NOT_INITIALIZED');
    expect(call(s, 2, 'nope').error?.code).toBe('UNKNOWN_CMD');
    expect(JSON.parse(s.handle('{bad')).error.code).toBe('BAD_REQUEST');
    expect(
      call(s, 3, 'reset', { config: { controlled: 'p0', opponent: 'external' } }).error?.code,
    ).toBe('BAD_CONFIG');
    expect(call(s, 4, 'reset', { config: { opponent: 'scripted:nope' } }).error?.code).toBe(
      'BAD_CONFIG',
    );
    expect(call(s, 5, 'reset', { config: { rules: { nope: 1 } } }).error?.code).toBe('BAD_CONFIG');
    expect(
      call(s, 6, 'reset', { config: { rules: { timeLimit: { duel: 'x' } } } }).error?.code,
    ).toBe('BAD_CONFIG');
    expect(
      call(s, 7, 'reset', { config: { stat_sampler: 'file:does/not/exist.json' } }).error?.code,
    ).toBe('BAD_CONFIG');
    expect(call(s, 8, 'reset', { config: { obs_delay: [9, 2] } }).error?.code).toBe('BAD_CONFIG');
    expect(call(s, 9, 'reset', { num_envs: 2, auto_reset: false }).error?.code).toBe('BAD_CONFIG');
    expect(call(s, 10, 'reset', { expect: { cobs_version: 'cobs_v9' } }).error?.code).toBe(
      'VERSION_MISMATCH',
    );
    expect(call(s, 11, 'reset', { expect: { cact_version: 'cact_v2' } }).error?.code).toBe(
      'VERSION_MISMATCH',
    );
  });

  it('plays self-play episodes with auto reset, masks, shaping and terminal rewards', () => {
    const s = new CombatEnvServer();
    let r = call(s, 1, 'reset', {
      num_envs: 4,
      seed: 42,
      encoding: 'json',
      config: { controlled: 'both' },
    });
    expect(r.ok).toBe(true);
    expect(r.result.n_ctrl).toBe(2);
    let envs: EnvOut[] = r.result.envs;
    expect(envs[0]!.obs).toHaveLength(2);
    expect(envs[0]!.obs[0]).toHaveLength(160);
    expect(envs[0]!.move_mask![0]).toHaveLength(9);
    expect(envs[0]!.button_mask![0]).toHaveLength(4);
    expect(envs[0]!.episode_start).toMatchObject({ episode: 0 });
    const rand = lcg(1);
    const outcomes: EnvOut[] = [];
    let shaped = 0;
    const modes = new Set<string>();
    for (let i = 0; i < 4000 && outcomes.length < 12; i++) {
      r = call(s, i + 2, 'step', { actions: randomActions(envs, rand, false) });
      expect(r.ok).toBe(true);
      envs = r.result.envs;
      for (const e of envs) {
        modes.add(e.mode);
        if (e.terminated || e.truncated) {
          outcomes.push(e);
          expect(e.episode_start).toBeDefined();
          expect(e.outcome).not.toBeNull();
          expect(Object.keys(e.final_obs).length).toBeGreaterThan(0);
        } else {
          expect(e.ticks_elapsed).toBe(4);
          for (const x of e.rewards) {
            expect(Math.abs(x)).toBeLessThanOrEqual(1);
            if (x !== 0) shaped++;
          }
        }
        if (e.mode === 'dragon') {
          expect(e.active).toEqual([true, false]);
          expect(e.move_mask![1]).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
          expect(e.button_mask![1]).toEqual([1, 0, 0, 0]);
          expect((e.obs[1] as number[]).every((x) => x === 0)).toBe(true);
          // on an auto reset the rewards belong to the finished episode, the mode to the new one
          if (!e.terminated && !e.truncated) expect(e.rewards[1]).toBe(0);
        }
      }
    }
    expect(outcomes.length).toBeGreaterThanOrEqual(12);
    expect(shaped).toBeGreaterThan(0);
    expect([...modes].sort()).toEqual(['dragon', 'pvp']);
    for (const e of outcomes) {
      const o = e.outcome;
      expect(['ko', 'timeout']).toContain(o.reason);
      if (e.terminated && o.winner !== 'dragon') {
        // zero-sum terminal reward on top of the clipped shaping term
        expect(Math.abs(e.rewards[o.winner]! - 1)).toBeLessThanOrEqual(1);
        expect(e.rewards[o.winner]!).toBeGreaterThan(e.rewards[1 - o.winner]!);
      }
      if (o.winner === 'dragon') expect(e.rewards[0]).toBeLessThan(0);
    }
  });

  it('serves one controlled slot against a scripted bot with flat actions', () => {
    const s = new CombatEnvServer();
    let r = call(s, 1, 'reset', {
      num_envs: 3,
      seed: 5,
      encoding: 'json',
      config: {
        controlled: 'p0',
        opponent: 'scripted:aggressive',
        flat_actions: true,
        mode_mix: { pvp: 1, dragon: 0 },
        jobs: ['ninja', 'uniform'],
      },
    });
    let envs: EnvOut[] = r.result.envs;
    expect(r.result.n_ctrl).toBe(1);
    expect(envs[0]!.mask![0]).toHaveLength(36);
    expect(envs[0]!.episode_start!.jobs[0]).toBe('ninja');
    expect(envs[0]!.episode_start!.opponent).toBe('combat-bot:aggressive');
    const rand = lcg(2);
    let ended = 0;
    for (let i = 0; i < 2000 && ended < 3; i++) {
      r = call(s, i + 2, 'step', { actions: randomActions(envs, rand, true) });
      expect(r.ok).toBe(true);
      envs = r.result.envs;
      for (const e of envs) {
        expect(e.mode).toBe('pvp');
        if (e.terminated) ended++;
      }
    }
    expect(ended).toBeGreaterThan(0);
  });

  it('is atomic on illegal actions', () => {
    const s = new CombatEnvServer();
    const twin = new CombatEnvServer();
    const params = {
      num_envs: 2,
      seed: 9,
      encoding: 'json',
      config: { controlled: 'p0', opponent: 'scripted:balanced', mode_mix: { pvp: 1, dragon: 0 } },
    };
    let envs: EnvOut[] = call(s, 1, 'reset', params).result.envs;
    call(twin, 1, 'reset', params);
    // walk until env 1 has a masked button, then send it
    const rand = lcg(3);
    let i = 2;
    for (; i < 400 && envs[1]!.button_mask![0]!.every((x) => x === 1); i++) {
      const actions = randomActions(envs, rand, false);
      envs = call(s, i, 'step', { actions }).result.envs;
      call(twin, i, 'step', { actions });
    }
    const masked = envs[1]!.button_mask![0]!.indexOf(0);
    expect(masked).toBeGreaterThan(0);
    const bad = call(s, i, 'step', { actions: [[[0, 0]], [[0, masked]]] });
    expect(bad.error).toMatchObject({ code: 'ILLEGAL_ACTION', env_index: 1 });
    expect(call(s, i + 1, 'step', { actions: [[[9, 0]], [[0, 0]]] }).error).toMatchObject({
      code: 'ILLEGAL_ACTION',
      env_index: 0,
    });
    expect(call(s, i + 2, 'step', { actions: [[[0, 0]]] }).error?.code).toBe('BAD_REQUEST');
    const good = { actions: [[[3, 0]], [[7, 0]]] };
    const a = call(s, i + 3, 'step', good);
    const b = call(twin, i + 3, 'step', good);
    expect(a.ok).toBe(true);
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
  });

  it('is byte-for-byte deterministic for the same seed, config and actions', () => {
    const run = () => {
      const s = new CombatEnvServer();
      const out: string[] = [];
      let envs: EnvOut[] = call(s, 1, 'reset', {
        num_envs: 3,
        seed: 77,
        config: { obs_delay: [4, 18], mirror: true },
      }).result.envs;
      const rand = lcg(4);
      for (let i = 0; i < 300; i++) {
        const line = s.handle(
          JSON.stringify({
            id: i + 2,
            cmd: 'step',
            params: { actions: randomActions(envs, rand, false) },
          }),
        );
        out.push(line);
        envs = JSON.parse(line).result.envs;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('stops after the episode without auto reset', () => {
    const s = new CombatEnvServer();
    let r = call(s, 1, 'reset', {
      num_envs: 1,
      seed: 3,
      auto_reset: false,
      encoding: 'json',
      config: { rules: { timeLimit: { duel: 240, dragonFight: 240 } } },
    });
    const rand = lcg(5);
    let e: EnvOut = r.result.envs[0]!;
    for (let i = 0; i < 1000 && !(e.terminated || e.truncated); i++) {
      r = call(s, i + 2, 'step', { actions: randomActions([e], rand, false) });
      e = r.result.envs[0]!;
    }
    expect(e.terminated).toBe(true);
    expect(e.tick).toBeLessThanOrEqual(240);
    expect(e.outcome.reason === 'timeout' || e.outcome.reason === 'ko').toBe(true);
    expect(e.episode_start).toBeUndefined();
    expect(e.button_mask!.every((m) => m.join() === '1,0,0,0')).toBe(true);
    expect(
      call(s, 9999, 'step', {
        actions: [
          [
            [0, 0],
            [0, 0],
          ],
        ],
      }).error?.code,
    ).toBe('EPISODE_OVER');
  });

  it('applies no input while a slot is not actionable and reports it', () => {
    const s = new CombatEnvServer();
    let envs: EnvOut[] = call(s, 1, 'reset', {
      num_envs: 8,
      seed: 21,
      encoding: 'json',
      config: { obs_delay: 0, mirror: false, mode_mix: { pvp: 1, dragon: 0 } },
    }).result.envs;
    const rand = lcg(6);
    let blocked = 0;
    for (let i = 0; i < 800; i++) {
      const wasBlocked = envs.map((e) => e.actionable.map((a) => !a));
      const actions = envs.map((e) => e.move_mask!.map(() => [3, 0]));
      const r = call(s, i + 2, 'step', {
        actions: i % 2 ? actions : randomActions(envs, rand, false),
      });
      envs = r.result.envs;
      envs.forEach((e, k) => {
        if (e.terminated || e.truncated || e.episode_start) return;
        e.actionable.forEach((_, slot) => {
          if (!wasBlocked[k]![slot]) return;
          blocked++;
          // g.prevMove (147..155) shows the ignored decision as none
          expect((e.obs[slot] as number[])[147]).toBe(1);
        });
      });
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('observes exactly the state `delay` ticks back, with the window and no-input rules', () => {
    const DELAY = 7;
    const s = new CombatEnvServer();
    const config = { obs_delay: DELAY, mirror: false, mode_mix: { pvp: 1, dragon: 0 } };
    let e: EnvOut = call(s, 1, 'reset', { num_envs: 1, seed: 8, encoding: 'json', config }).result
      .envs[0]!;
    const { stats, seed } = e.episode_start!;
    // independent replay of the env loop on the public sim API
    let sim: CombatState = createCombat({ kind: 'duel', a: stats[0]!, b: stats[1]! }, seed);
    const history: CombatState[] = [sim];
    const held: FighterInput[] = [NO_INPUT, NO_INPUT];
    const prev = [
      [0, 0],
      [0, 0],
    ];
    const sides: Side[] = ['a', 'b'];
    const expectObs = () =>
      sides.map((side, k) =>
        Array.from(
          encodeCombatObservation(history[Math.max(0, history.length - 1 - DELAY)]!, side, {
            delay: DELAY,
            prevMove: prev[k]![0]!,
            prevButton: prev[k]![1]!,
          }),
        ),
      );
    expect(e.obs).toEqual(expectObs());
    const rand = lcg(9);
    let steps = 0;
    let ended = false;
    const maxSteps = Math.ceil(DEFAULT_COMBAT_RULES.timeLimit.duel / 4) + 1;
    for (let i = 0; i < maxSteps && !ended; i++) {
      const actions = randomActions([e], rand, false)[0] as [number, number][];
      sides.forEach((side, k) => {
        if (!isActionable(sim, side, 4)) {
          held[k] = NO_INPUT;
          prev[k] = [0, 0];
        } else {
          held[k] = toFighterInput({ move: actions[k]![0], button: actions[k]![1] }, held[k]).input;
          prev[k] = actions[k]!;
        }
      });
      let live = 0;
      while (!sim.outcome && !(live >= 4 && sim.hitstop === 0)) {
        const isLive = sim.hitstop === 0;
        sim = stepCombat(sim, [held[0]!, held[1]!]).state;
        history.push(sim);
        if (isLive) live++;
      }
      e = call(s, i + 2, 'step', { actions: [actions] }).result.envs[0]!;
      steps++;
      if (e.terminated || e.truncated) {
        // auto reset: the finished fight's last observations come back as final_obs
        expect(sim.outcome).not.toBeNull();
        const want = expectObs();
        expect([e.final_obs['0'], e.final_obs['1']]).toEqual(want);
        ended = true;
      } else {
        expect(e.tick).toBe(sim.tick);
        expect(e.obs).toEqual(expectObs());
      }
    }
    expect(steps).toBeGreaterThan(20);
    expect(ended).toBe(true);
  });

  it('samples stats from a stat_dist_v1 file and dragon curriculum scales', () => {
    const dir = mkdtempSync(join(tmpdir(), 'combat-env-'));
    const file = join(dir, 'stat_dist_v1.json');
    const records = runBatch({
      games: 6,
      players: 4,
      bots: 'heuristic',
      baseSeed: 4,
      logFights: true,
    });
    writeFileSync(file, JSON.stringify(statDistFromRecords(records, 'dice')));
    const s = new CombatEnvServer();
    const r = call(s, 1, 'reset', {
      num_envs: 6,
      seed: 1,
      encoding: 'json',
      config: {
        stat_sampler: `file:${file}`,
        mode_mix: { pvp: 0, dragon: 1 },
        dragon_curriculum: { hp_scale: [0.5, 0.6], telegraph_scale: [1.3, 1.3] },
      },
    });
    expect(r.ok).toBe(true);
    for (const e of r.result.envs) {
      const start = e.episode_start!;
      expect(e.mode).toBe('dragon');
      expect(start.dragon_hp_scale).toBeGreaterThanOrEqual(0.5);
      expect(start.dragon_hp_scale).toBeLessThanOrEqual(0.6);
      expect(start.telegraph_scale).toBeCloseTo(1.3);
      expect(start.stats[1]!.hp).toBeLessThan(60);
      expect(start.mirror.y).toBe(false);
    }
  });

  it('benchmarks 64 self-play envs (decisions per second)', () => {
    const s = new CombatEnvServer();
    let envs: EnvOut[] = call(s, 1, 'reset', {
      num_envs: 64,
      seed: 11,
      config: { controlled: 'both' },
    }).result.envs;
    const rand = lcg(7);
    const steps = 150;
    let decisions = 0;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      envs = JSON.parse(
        s.handle(
          JSON.stringify({
            id: i + 2,
            cmd: 'step',
            params: { actions: randomActions(envs, rand, false) },
          }),
        ),
      ).result.envs;
      for (const e of envs) decisions += e.active.filter(Boolean).length;
    }
    const seconds = (performance.now() - t0) / 1000;
    const rate = decisions / seconds;
    console.log(
      `combat env: 64 envs x ${steps} steps, ${decisions} decisions in ${seconds.toFixed(2)}s = ${Math.round(rate)} decisions/s (incl. JSON round trip)`,
    );
    expect(rate).toBeGreaterThan(1000);
  });
});

describe('combat env server (stdio)', () => {
  it('speaks JSON lines over stdin/stdout and keeps stdout protocol-only', async () => {
    const entry = fileURLToPath(new URL('../src/combat-env-server.ts', import.meta.url));
    const child = spawn(process.execPath, ['--import', 'tsx', entry], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    const all: string[] = [];
    const waiting: ((l: string) => void)[] = [];
    lines.on('line', (l) => {
      all.push(l);
      waiting.shift()?.(l);
    });
    const send = (msg: object) =>
      new Promise<Res>((resolve) => {
        waiting.push((l) => resolve(JSON.parse(l) as Res));
        child.stdin.write(JSON.stringify(msg) + '\n');
      });
    const info = await send({ id: 1, cmd: 'info' });
    const reset = await send({ id: 2, cmd: 'reset', params: { num_envs: 2, seed: 5 } });
    const step = await send({
      id: 3,
      cmd: 'step',
      params: {
        actions: [
          [
            [0, 0],
            [0, 0],
          ],
          [
            [0, 0],
            [0, 0],
          ],
        ],
      },
    });
    const close = await send({ id: 4, cmd: 'close' });
    const code = await new Promise((resolve) => child.once('exit', resolve));
    expect([info, reset, step, close].map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(info.result.protocol).toBe('rpgboard-combat-env/1');
    const obs = reset.result.envs[0]!.obs[0] as string;
    expect(typeof obs).toBe('string');
    expect(Buffer.from(obs, 'base64').length).toBe(160 * 4);
    expect(all.every((l) => l.startsWith('{"id":'))).toBe(true);
    expect(code).toBe(0);
  });
});
