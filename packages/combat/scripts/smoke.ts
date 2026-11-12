/**
 * Debug helper: per-move damage breakdown for one matchup.
 *   tsx scripts/smoke.ts <jobA> <jobB|dragon> [n] [style] [hp/atk/def] [--set path=value ...]
 */
import { DEFAULT_RULES, type JobId } from '@dragon-rush/engine';
import { baseFighter, statFighter } from '../test/calibration';
import {
  createCombatBot,
  DEFAULT_COMBAT_RULES,
  runCombat,
  type BotStyle,
  type CombatEvent,
  type CombatSetup,
} from '../src/index';
import { patchRules } from './calibrateWorker';

const argv = process.argv.slice(2);
const sets: string[] = [];
const pos: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set') sets.push(argv[++i] ?? '');
  else pos.push(argv[i]!);
}
const ja = (pos[0] ?? 'swordsman') as JobId;
const jb = pos[1] ?? 'archer';
const n = Number(pos[2] ?? '40');
const style = (pos[3] ?? 'balanced') as BotStyle;
const stat = pos[4];
const rules = sets.length ? patchRules(DEFAULT_COMBAT_RULES, sets) : DEFAULT_COMBAT_RULES;
const bot = createCombatBot(style);
const dmg: Record<string, number> = {};
const cnt: Record<string, number> = {};
const types: Record<string, number> = {};
let wins = 0;
let ticks = 0;
for (let s = 0; s < n; s++) {
  const a = stat
    ? statFighter(ja, ...(stat.split('/').map(Number) as [number, number, number]))
    : baseFighter(ja);
  const setup: CombatSetup =
    jb === 'dragon'
      ? { kind: 'dragonFight', a, b: null, dragon: { ...DEFAULT_RULES.dragon } }
      : { kind: 'duel', a, b: baseFighter(jb as JobId) };
  const out = runCombat(setup, [bot, bot], 100 + s, rules, { recordEvents: true });
  if (out.result.winner === 'a') wins += 1;
  ticks += out.ticks;
  for (const e of out.events as CombatEvent[]) {
    const t =
      e.type === 'AttackStart'
        ? `AttackStart:${e.who}:${e.move}`
        : e.type === 'SkillUsed'
          ? `Skill:${e.who}`
          : e.type === 'Dash'
            ? `Dash:${e.who}`
            : e.type;
    types[t] = (types[t] ?? 0) + 1;
    if (e.type === 'Hit') {
      const k = `${e.attacker}:${e.kind}${e.backstab ? ':backstab' : ''}`;
      dmg[k] = (dmg[k] ?? 0) + e.dmg;
      cnt[k] = (cnt[k] ?? 0) + 1;
    }
  }
}
console.log(
  `${ja} vs ${jb}: a wins ${((100 * wins) / n).toFixed(0)}%, avg ${(ticks / n / 60).toFixed(1)} s`,
);
console.log(
  Object.entries(types)
    .map(([k, v]) => `${k}=${(v / n).toFixed(1)}`)
    .join('  '),
);
for (const k of Object.keys(dmg).sort())
  console.log(
    k.padEnd(24),
    'hits/fight',
    (cnt[k]! / n).toFixed(1),
    'dmg/fight',
    (dmg[k]! / n).toFixed(1),
  );
