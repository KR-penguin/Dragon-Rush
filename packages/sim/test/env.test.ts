import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnvServer } from '../src/index';

type Res = { id: number; ok: boolean; result?: any; error?: { code: string; env_index?: number } }; // eslint-disable-line @typescript-eslint/no-explicit-any

const call = (server: EnvServer, id: number, cmd: string, params?: object): Res =>
  JSON.parse(server.handle(JSON.stringify({ id, cmd, params })));

function firstLegal(envs: { legal: number[] }[]): number[] {
  return envs.map((e) => e.legal.find((i) => i !== 2) ?? e.legal[0]!);
}

describe('env server (in-process)', () => {
  it('reports versions and dims', () => {
    const r = call(new EnvServer(), 1, 'info');
    expect(r.result).toMatchObject({
      protocol: 'rpgboard-env/1',
      obs_dim: 253,
      action_dim: 47,
      obs_version: 'obs_v1',
      act_version: 'act_v1',
    });
    expect(r.result.action_names).toHaveLength(47);
  });

  it('rejects step before reset and unknown commands', () => {
    const s = new EnvServer();
    expect(call(s, 1, 'step', { actions: [0] }).error?.code).toBe('NOT_INITIALIZED');
    expect(call(s, 2, 'nope').error?.code).toBe('UNKNOWN_CMD');
    expect(JSON.parse(s.handle('{bad')).error.code).toBe('BAD_REQUEST');
  });

  it('runs single-agent episodes with auto reset and sparse rewards', () => {
    const s = new EnvServer();
    let r = call(s, 1, 'reset', {
      num_envs: 3,
      seed: 42,
      encoding: 'json',
      config: { mode: 'single', num_players: 4 },
    });
    expect(r.ok).toBe(true);
    let envs = r.result.envs;
    expect(envs[0].obs).toHaveLength(253);
    expect(envs[0].episode_start.num_players).toBe(4);
    let finished = 0;
    for (let i = 1; i < 3000 && finished < 5; i++) {
      r = call(s, i + 1, 'step', { actions: firstLegal(envs) });
      expect(r.ok).toBe(true);
      envs = r.result.envs;
      for (const e of envs) {
        if (e.terminated || e.truncated) {
          finished++;
          expect(e.episode_start).toBeDefined();
          expect(e.legal.length).toBeGreaterThan(0);
        } else {
          expect(e.legal.length).toBeGreaterThan(0);
          if (e.legal.length === 1) expect(e.phase).toBe('CHOOSE_PVP_TARGET');
        }
      }
    }
    expect(finished).toBeGreaterThan(0);
  });

  it('is atomic on illegal actions', () => {
    const s = new EnvServer();
    const r = call(s, 1, 'reset', { num_envs: 2, seed: 1, encoding: 'json' });
    const legal0 = r.result.envs[0].legal[0];
    const bad = call(s, 2, 'step', { actions: [legal0, 46] });
    expect(bad.error).toMatchObject({ code: 'ILLEGAL_ACTION', env_index: 1 });
    const again = call(s, 3, 'step', { actions: [legal0, r.result.envs[1].legal[0]] });
    expect(again.ok).toBe(true);
  });

  it('is deterministic for the same seed and actions', () => {
    const run = () => {
      const s = new EnvServer();
      const out: string[] = [];
      let envs = call(s, 1, 'reset', {
        num_envs: 2,
        seed: 7,
        config: { mode: 'selfplay', num_players: [2, 3, 4] },
      }).result.envs;
      for (let i = 0; i < 200; i++) {
        const r = call(s, i + 2, 'step', { actions: firstLegal(envs) });
        out.push(JSON.stringify(r));
        envs = r.result.envs;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('returns terminal observation without auto reset and then refuses to step', () => {
    const s = new EnvServer();
    let r = call(s, 1, 'reset', {
      num_envs: 1,
      seed: 3,
      auto_reset: false,
      encoding: 'json',
      config: { mode: 'single', num_players: 2 },
    });
    for (let i = 0; i < 5000; i++) {
      const env = r.result.envs[0];
      if (env.terminated || env.truncated) break;
      r = call(s, i + 2, 'step', {
        actions: [env.legal.includes(2) && i > 200 ? 2 : env.legal[0]],
      });
    }
    const env = r.result.envs[0];
    expect(env.terminated || env.truncated).toBe(true);
    expect(env.legal).toEqual([]);
    expect(call(s, 99999, 'step', { actions: [0] }).error?.code).toBe('EPISODE_OVER');
  });

  it('resolves fights with the real-time sim when combat_resolver is sim', () => {
    const run = () => {
      const s = new EnvServer();
      const r = call(s, 1, 'reset', {
        num_envs: 2,
        seed: 31,
        config: { mode: 'selfplay', num_players: 4, combat_resolver: 'sim', return_events: true },
      });
      expect(r.result.combat_resolver).toBe('sim');
      let envs = r.result.envs;
      const out: string[] = [];
      let fights = 0;
      let finished = 0;
      for (let i = 0; i < 1500 && finished < 2; i++) {
        const step = call(s, i + 2, 'step', { actions: firstLegal(envs) });
        expect(step.ok).toBe(true);
        out.push(JSON.stringify(step.result));
        envs = step.result.envs;
        for (const e of envs) {
          if (e.terminated || e.truncated) finished++;
          fights += (e.events as { type: string }[]).filter((x) => x.type === 'CombatEnded').length;
          // the real-time resolver writes back summaries only: no dice exchanges
          expect((e.events as { type: string }[]).some((x) => x.type === 'CombatHit')).toBe(false);
        }
      }
      expect(fights).toBeGreaterThan(0);
      return out;
    };
    expect(run()).toEqual(run());
    expect(
      call(new EnvServer(), 1, 'reset', { expect: { combat_resolver: 'sim' } }).error?.code,
    ).toBe('VERSION_MISMATCH');
    expect(
      call(new EnvServer(), 1, 'reset', { config: { combat_resolver: 'outcome' } }).result
        ?.outcome_model_id,
    ).toBe('outcome-v1-rush4-transfer');
  });

  it('rejects bad configs', () => {
    const s = new EnvServer();
    expect(call(s, 1, 'reset', { config: { mode: 'weird' } }).error?.code).toBe('BAD_CONFIG');
    expect(call(s, 2, 'reset', { expect: { obs_version: 'obs_v9' } }).error?.code).toBe(
      'VERSION_MISMATCH',
    );
  });
});

describe('env server (stdio)', () => {
  it('speaks JSON lines over stdin/stdout', async () => {
    const entry = fileURLToPath(new URL('../src/env-server.ts', import.meta.url));
    const child = spawn(process.execPath, ['--import', 'tsx', entry], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    const responses: Res[] = [];
    const next = () =>
      new Promise<Res>((resolve) => lines.once('line', (l) => resolve(JSON.parse(l))));
    child.stdin.write(JSON.stringify({ id: 1, cmd: 'info' }) + '\n');
    responses.push(await next());
    child.stdin.write(JSON.stringify({ id: 2, cmd: 'reset', params: { seed: 5 } }) + '\n');
    responses.push(await next());
    child.stdin.write(JSON.stringify({ id: 3, cmd: 'close' }) + '\n');
    responses.push(await next());
    const code = await new Promise((resolve) => child.once('exit', resolve));
    expect(responses.map((r) => r.ok)).toEqual([true, true, true]);
    expect(typeof responses[1]!.result.envs[0].obs).toBe('string');
    expect(code).toBe(0);
  });
});
