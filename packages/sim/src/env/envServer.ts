import { DEFAULT_RULES } from '@dragon-rush/engine';
import {
  ACT_VERSION,
  ACTION_DIM,
  ACTION_NAMES,
  BOT_NAMES,
  OBS_DIM,
  OBS_V3_LAYOUT,
  OBS_VERSION,
} from '@dragon-rush/ai';
import { RequestSchema, ResetParamsSchema, StepParamsSchema, type ResetParams } from './config';
import { buildRules, EnvError, EnvInstance, type Transition } from './envInstance';

export const ENV_PROTOCOL = 'rpgboard-env/2';

type Json = Record<string, unknown>;

const encodeObs = (obs: Float32Array, encoding: 'b64' | 'json') =>
  encoding === 'b64'
    ? Buffer.from(obs.buffer, obs.byteOffset, obs.byteLength).toString('base64')
    : Array.from(obs);

/** Stateful request handler; transport-agnostic so it can be tested in-process. */
export class EnvServer {
  private envs: EnvInstance[] = [];
  private params: ResetParams | null = null;
  closed = false;

  handle(line: string): string {
    let id: number | null = null;
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        throw new EnvError('BAD_REQUEST', 'invalid JSON');
      }
      const req = RequestSchema.safeParse(raw);
      if (!req.success) throw new EnvError('BAD_REQUEST', req.error.message);
      id = req.data.id;
      const result = this.dispatch(req.data.cmd, req.data.params ?? {});
      return JSON.stringify({ id, ok: true, result });
    } catch (e) {
      const err = e instanceof EnvError ? e : new EnvError('INTERNAL', (e as Error).message);
      const error: Json = { code: err.code, message: err.message };
      if ((e as { envIndex?: number }).envIndex !== undefined)
        error.env_index = (e as { envIndex?: number }).envIndex;
      return JSON.stringify({ id, ok: false, error });
    }
  }

  private dispatch(cmd: string, params: Json): Json {
    switch (cmd) {
      case 'info':
        return {
          protocol: ENV_PROTOCOL,
          obs_version: OBS_VERSION,
          act_version: ACT_VERSION,
          obs_dim: OBS_DIM,
          action_dim: ACTION_DIM,
          rules_version: DEFAULT_RULES.version,
          action_names: ACTION_NAMES,
          obs_layout: OBS_V3_LAYOUT,
          bots: BOT_NAMES,
        };
      case 'reset':
        return this.reset(params);
      case 'step':
        return this.step(params);
      case 'close':
        this.closed = true;
        return {};
      default:
        throw new EnvError('UNKNOWN_CMD', `unknown cmd ${cmd}`);
    }
  }

  private reset(raw: Json): Json {
    const parsed = ResetParamsSchema.safeParse(raw);
    if (!parsed.success) throw new EnvError('BAD_CONFIG', parsed.error.message);
    const p = parsed.data;
    if (p.expect?.obs_version && p.expect.obs_version !== OBS_VERSION)
      throw new EnvError('VERSION_MISMATCH', `obs ${OBS_VERSION}`);
    if (p.expect?.act_version && p.expect.act_version !== ACT_VERSION)
      throw new EnvError('VERSION_MISMATCH', `act ${ACT_VERSION}`);
    if (p.expect?.combat_resolver && p.expect.combat_resolver !== p.config.combat_resolver) {
      throw new EnvError('VERSION_MISMATCH', `combat_resolver ${p.config.combat_resolver}`);
    }
    if (!p.auto_reset && p.num_envs !== 1)
      throw new EnvError('BAD_CONFIG', 'auto_reset=false requires num_envs=1');
    const seed = p.seed ?? (Date.now() % 2 ** 31) * 1000 + Math.floor(Math.random() * 1000);
    const rules = buildRules(p.config);
    this.params = { ...p, seed };
    this.envs = Array.from(
      { length: p.num_envs },
      (_, i) => new EnvInstance(i, seed, p.config, rules),
    );
    return {
      seed,
      combat_resolver: p.config.combat_resolver,
      envs: this.envs.map((env) => this.serialize(env.reset())),
    };
  }

  private step(raw: Json): Json {
    if (!this.params) throw new EnvError('NOT_INITIALIZED', 'call reset first');
    const parsed = StepParamsSchema.safeParse(raw);
    if (!parsed.success) throw new EnvError('BAD_REQUEST', parsed.error.message);
    const { actions } = parsed.data;
    if (actions.length !== this.envs.length)
      throw new EnvError('BAD_REQUEST', `expected ${this.envs.length} actions`);
    this.envs.forEach((env, i) => {
      try {
        env.validate(actions[i]!);
      } catch (e) {
        Object.assign(e as object, { envIndex: i });
        throw e;
      }
    });
    const envs = this.envs.map((env, i) => {
      const t = env.step(actions[i]!);
      if (env.isDone && this.params!.auto_reset) {
        const next = env.reset();
        return this.serialize({
          ...t,
          ...pick(next, [
            'obs',
            'legal',
            'acting_seat',
            'turn_seat',
            'phase',
            'round',
            'episode_start',
          ]),
        });
      }
      return this.serialize(t);
    });
    return { envs };
  }

  private serialize(t: Transition): Json {
    const enc = this.params?.encoding ?? 'b64';
    const out: Json = {
      obs: encodeObs(t.obs, enc),
      legal: t.legal,
      acting_seat: t.acting_seat,
      turn_seat: t.turn_seat,
      phase: t.phase,
      round: t.round,
      rewards: t.rewards,
      terminated: t.terminated,
      truncated: t.truncated,
      outcome: t.outcome,
      eliminated: t.eliminated,
      final_obs: Object.fromEntries(
        Object.entries(t.final_obs).map(([k, v]) => [k, encodeObs(v, enc)]),
      ),
    };
    if (t.episode_start) out.episode_start = t.episode_start;
    if (t.events) out.events = t.events;
    return out;
  }
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
