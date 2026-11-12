import { COMBAT_TICK_HZ, DEFAULT_COMBAT_RULES, hashCombatRules } from '@dragon-rush/combat';
import {
  CACT_FLAT_DIM,
  CACT_NAMES,
  CACT_NVEC,
  CACT_V1_NAMES,
  CACT_VERSION,
  COBS_DIM,
  COBS_V1_LAYOUT,
  COBS_VERSION,
  COMBAT_BOT_NAMES,
  flatMask,
  fromFlat,
  isCombatBotName,
  type CombatAction,
} from '@dragon-rush/combat-ai';
import {
  CombatRequestSchema,
  CombatResetParamsSchema,
  CombatStepParamsSchema,
  type CombatEnvConfig,
  type CombatResetParams,
} from './config';
import { CombatEnvInstance, type CombatTransition, type DecisionCounter } from './instance';
import { buildCombatRules, CombatEnvError, parseStatSampler } from './sampler';

export const COMBAT_ENV_PROTOCOL = 'rpgboard-combat-env/1';

type Json = Record<string, unknown>;

const encodeObs = (obs: Float32Array, encoding: 'b64' | 'json') =>
  encoding === 'b64'
    ? Buffer.from(obs.buffer, obs.byteOffset, obs.byteLength).toString('base64')
    : Array.from(obs);

function checkConfig(c: CombatEnvConfig): void {
  if (c.opponent === 'external') {
    if (c.controlled === 'p0')
      throw new CombatEnvError('BAD_CONFIG', "opponent 'external' needs controlled 'both'");
  } else if (!isCombatBotName(c.opponent)) {
    throw new CombatEnvError(
      'BAD_CONFIG',
      `opponent must be external or one of ${COMBAT_BOT_NAMES.join(', ')}`,
    );
  }
  if (Array.isArray(c.obs_delay) && c.obs_delay[0] > c.obs_delay[1])
    throw new CombatEnvError('BAD_CONFIG', 'obs_delay must be [min, max]');
  const cur = c.dragon_curriculum;
  if (cur && (cur.hp_scale[0] <= 0 || cur.telegraph_scale[0] <= 0))
    throw new CombatEnvError('BAD_CONFIG', 'curriculum scales must be > 0');
}

/** Stateful request handler for the combat env (stdio transport in combat-env-server.ts). */
export class CombatEnvServer {
  private envs: CombatEnvInstance[] = [];
  private params: CombatResetParams | null = null;
  /** Shaping anneal counter: decisions served by this process (never reset). */
  private readonly counter: DecisionCounter = { value: 0 };
  closed = false;

  handle(line: string): string {
    let id: number | null = null;
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(line) as unknown;
      } catch {
        throw new CombatEnvError('BAD_REQUEST', 'invalid JSON');
      }
      const req = CombatRequestSchema.safeParse(raw);
      if (!req.success) throw new CombatEnvError('BAD_REQUEST', req.error.message);
      id = req.data.id;
      const result = this.dispatch(req.data.cmd, req.data.params ?? {});
      return JSON.stringify({ id, ok: true, result });
    } catch (e) {
      const err =
        e instanceof CombatEnvError ? e : new CombatEnvError('INTERNAL', (e as Error).message);
      const error: Json = { code: err.code, message: err.message };
      const envIndex = (e as { envIndex?: number }).envIndex;
      if (envIndex !== undefined) error.env_index = envIndex;
      return JSON.stringify({ id, ok: false, error });
    }
  }

  private dispatch(cmd: string, params: Json): Json {
    switch (cmd) {
      case 'info':
        return {
          protocol: COMBAT_ENV_PROTOCOL,
          cobs_version: COBS_VERSION,
          cact_version: CACT_VERSION,
          cobs_dim: COBS_DIM,
          cact_nvec: CACT_NVEC,
          cact_flat_dim: CACT_FLAT_DIM,
          tick_hz: COMBAT_TICK_HZ,
          combat_rules_version: DEFAULT_COMBAT_RULES.version,
          combat_rules_hash: hashCombatRules(DEFAULT_COMBAT_RULES),
          obs_layout: COBS_V1_LAYOUT,
          action_names: { ...CACT_V1_NAMES, flat: CACT_NAMES },
          bots: COMBAT_BOT_NAMES,
        };
      case 'reset':
        return this.reset(params);
      case 'step':
        return this.step(params);
      case 'close':
        this.closed = true;
        return {};
      default:
        throw new CombatEnvError('UNKNOWN_CMD', `unknown cmd ${cmd}`);
    }
  }

  private reset(raw: Json): Json {
    const parsed = CombatResetParamsSchema.safeParse(raw);
    if (!parsed.success) throw new CombatEnvError('BAD_CONFIG', parsed.error.message);
    const p = parsed.data;
    const ex = p.expect;
    if (ex?.cobs_version && ex.cobs_version !== COBS_VERSION)
      throw new CombatEnvError('VERSION_MISMATCH', `cobs ${COBS_VERSION}`);
    if (ex?.cact_version && ex.cact_version !== CACT_VERSION)
      throw new CombatEnvError('VERSION_MISMATCH', `cact ${CACT_VERSION}`);
    if (!p.auto_reset && p.num_envs !== 1)
      throw new CombatEnvError('BAD_CONFIG', 'auto_reset=false requires num_envs=1');
    checkConfig(p.config);
    const rules = buildCombatRules(p.config);
    if (ex?.combat_rules_version && ex.combat_rules_version !== rules.version) {
      throw new CombatEnvError('VERSION_MISMATCH', `combat rules ${rules.version}`);
    }
    const sampler = parseStatSampler(p.config.stat_sampler);
    const seed = p.seed ?? (Date.now() % 2 ** 31) * 1000 + Math.floor(Math.random() * 1000);
    const maxDelay =
      typeof p.config.obs_delay === 'number' ? p.config.obs_delay : p.config.obs_delay[1];
    this.params = { ...p, seed };
    this.envs = Array.from(
      { length: p.num_envs },
      (_, i) => new CombatEnvInstance(i, seed, p.config, rules, sampler, maxDelay, this.counter),
    );
    return {
      seed,
      n_ctrl: this.envs[0]!.nCtrl,
      combat_rules_version: rules.version,
      combat_rules_hash: hashCombatRules(rules),
      envs: this.envs.map((env) => this.serialize(env.reset())),
    };
  }

  private parseActions(
    raw: unknown[],
    nCtrl: number,
    flat: boolean,
    envIndex: number,
  ): CombatAction[] {
    if (raw.length !== nCtrl)
      throw Object.assign(new CombatEnvError('BAD_REQUEST', `expected ${nCtrl} actions per env`), {
        envIndex,
      });
    return raw.map((a) => {
      if (flat) {
        if (typeof a !== 'number' || a < 0 || a >= CACT_FLAT_DIM) {
          throw Object.assign(
            new CombatEnvError('ILLEGAL_ACTION', `flat action ${JSON.stringify(a)} out of range`),
            { envIndex },
          );
        }
        return fromFlat(a);
      }
      if (!Array.isArray(a))
        throw Object.assign(new CombatEnvError('BAD_REQUEST', 'expected [move, button] pairs'), {
          envIndex,
        });
      const [move, button] = a as [number, number];
      if (move < 0 || move >= CACT_NVEC[0] || button < 0 || button >= CACT_NVEC[1]) {
        throw Object.assign(
          new CombatEnvError('ILLEGAL_ACTION', `action [${move}, ${button}] out of range`),
          { envIndex },
        );
      }
      return { move, button };
    });
  }

  private step(raw: Json): Json {
    const p = this.params;
    if (!p) throw new CombatEnvError('NOT_INITIALIZED', 'call reset first');
    const parsed = CombatStepParamsSchema.safeParse(raw);
    if (!parsed.success) throw new CombatEnvError('BAD_REQUEST', parsed.error.message);
    const { actions } = parsed.data;
    if (actions.length !== this.envs.length)
      throw new CombatEnvError('BAD_REQUEST', `expected ${this.envs.length} action lists`);
    const decoded = this.envs.map((env, i) =>
      this.parseActions(actions[i]!, env.nCtrl, p.config.flat_actions, i),
    );
    // validate everything first: one bad action leaves every env untouched
    this.envs.forEach((env, i) => {
      try {
        env.validate(decoded[i]!);
      } catch (e) {
        throw Object.assign(e as object, { envIndex: i });
      }
    });
    const envs = this.envs.map((env, i) => {
      const t = env.step(decoded[i]!);
      if (env.isDone && p.auto_reset) {
        const next = env.reset();
        return this.serialize({
          ...t,
          obs: next.obs,
          masks: next.masks,
          actionable: next.actionable,
          active: next.active,
          tick: next.tick,
          mode: next.mode,
          ...(next.episode_start ? { episode_start: next.episode_start } : {}),
        });
      }
      return this.serialize(t);
    });
    return { envs };
  }

  private serialize(t: CombatTransition): Json {
    const enc = this.params?.encoding ?? 'b64';
    const flat = this.params?.config.flat_actions ?? false;
    const out: Json = { obs: t.obs.map((o) => encodeObs(o, enc)) };
    if (flat) out.mask = t.masks.map((m) => Array.from(flatMask(m)));
    else {
      out.move_mask = t.masks.map((m) => Array.from(m.move));
      out.button_mask = t.masks.map((m) => Array.from(m.button));
    }
    out.rewards = t.rewards;
    out.actionable = t.actionable;
    out.active = t.active;
    out.ticks_elapsed = t.ticks_elapsed;
    out.tick = t.tick;
    out.mode = t.mode;
    out.terminated = t.terminated;
    out.truncated = t.truncated;
    out.outcome = t.outcome;
    out.final_obs = Object.fromEntries(
      Object.entries(t.final_obs).map(([k, v]) => [k, encodeObs(v, enc)]),
    );
    if (t.episode_start) out.episode_start = t.episode_start;
    if (t.events) out.events = t.events;
    return out;
  }
}
