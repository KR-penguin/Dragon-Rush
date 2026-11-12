import {
  createCombat,
  createCombatBot,
  NO_INPUT,
  policyRandom,
  stepCombat,
  type BotStyle,
  type CombatEvent,
  type CombatPolicy,
  type CombatSetup,
  type CombatState,
  type FighterInput,
  type FighterSetup,
} from '@dragon-rush/combat';
import { DEFAULT_RULES, JOB_IDS, type JobId } from '@dragon-rush/engine';

export function fighter(job: JobId, extra: Partial<FighterSetup> = {}): FighterSetup {
  const j = DEFAULT_RULES.jobs[job];
  return {
    job,
    hp: j.hp,
    maxHp: j.hp,
    atk: j.atk,
    def: j.def,
    indomitableAvailable: true,
    ...extra,
  };
}

export function duel(a: JobId, b: JobId): CombatSetup {
  return { kind: 'duel', a: fighter(a), b: fighter(b) };
}

export function dragonFight(a: JobId, extra: Partial<FighterSetup> = {}): CombatSetup {
  const d = DEFAULT_RULES.dragon;
  return {
    kind: 'dragonFight',
    a: fighter(a, extra),
    b: null,
    dragon: { hp: d.hp, atk: d.atk, def: d.def },
  };
}

/** Every setup family the encoder must handle: all 25 job pairs and 5 dragon fights. */
export function allSetups(): CombatSetup[] {
  const out: CombatSetup[] = [];
  for (const a of JOB_IDS) for (const b of JOB_IDS) out.push(duel(a, b));
  for (const a of JOB_IDS) out.push(dragonFight(a, { atk: 9, def: 8, maxHp: 80, hp: 80 }));
  return out;
}

export interface Frame {
  readonly state: CombatState;
  /** Inputs applied on the step that produced the next frame. */
  readonly inputs: readonly [FighterInput, FighterInput];
  readonly events: readonly CombatEvent[];
}

/** Plays a scripted fight with the immutable stepCombat and keeps every state (with the inputs applied). */
export function playFight(
  setup: CombatSetup,
  seed: number,
  style: BotStyle = 'balanced',
  maxTicks = 6000,
): Frame[] {
  const bots: [CombatPolicy, CombatPolicy] = [createCombatBot(style), createCombatBot(style)];
  const ra = policyRandom(seed, 1);
  const rb = policyRandom(seed, 2);
  let s = createCombat(setup, seed);
  const frames: Frame[] = [];
  for (let i = 0; i < maxTicks && !s.outcome; i++) {
    const ia = bots[0].decide(s, 'a', ra);
    const ib = s.b ? bots[1].decide(s, 'b', rb) : NO_INPUT;
    const r = stepCombat(s, [ia, ib]);
    frames.push({ state: s, inputs: [ia, ib], events: r.events });
    s = r.state;
  }
  frames.push({ state: s, inputs: [NO_INPUT, NO_INPUT], events: [] });
  return frames;
}
