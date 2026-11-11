/** Debug helper: damage breakdown by move for one matchup.  tsx scripts/smoke.ts <jobA> <jobB|dragon> [n] [style] */
import { DEFAULT_RULES, type JobId } from '@dragon-rush/engine';
import { baseFighter, statFighter } from '../test/calibration';
import { createCombatBot, runCombat, type BotStyle, type CombatEvent, type CombatSetup } from '../src/index';

const ja = (process.argv[2] ?? 'swordsman') as JobId;
const jb = process.argv[3] ?? 'archer';
const n = Number(process.argv[4] ?? '40');
const style = (process.argv[5] ?? 'balanced') as BotStyle;
const stat = process.argv[6];
const bot = createCombatBot(style);
const dmg: Record<string, number> = {};
const cnt: Record<string, number> = {};
const types: Record<string, number> = {};
let wins = 0;
let ticks = 0;
for (let s = 0; s < n; s++) {
  const a = stat ? statFighter(ja, ...(stat.split('/').map(Number) as [number, number, number])) : baseFighter(ja);
  const setup: CombatSetup =
    jb === 'dragon'
      ? { kind: 'dragonFight', a, b: null, dragon: { ...DEFAULT_RULES.dragon } }
      : { kind: 'duel', a, b: baseFighter(jb as JobId) };
  const out = runCombat(setup, [bot, bot], 100 + s, undefined, { recordEvents: true });
  if (out.result.winner === 'a') wins += 1;
  ticks += out.ticks;
  for (const e of out.events as CombatEvent[]) {
    types[e.type] = (types[e.type] ?? 0) + 1;
    if (e.type === 'Hit') {
      const k = `${e.attacker}:${e.kind}`;
      dmg[k] = (dmg[k] ?? 0) + e.dmg;
      cnt[k] = (cnt[k] ?? 0) + 1;
    }
  }
}
console.log(`${ja} vs ${jb}: a wins ${((100 * wins) / n).toFixed(0)}%, avg ${(ticks / n / 60).toFixed(1)} s`);
console.log('events/fight', Object.fromEntries(Object.entries(types).map(([k, v]) => [k, +(v / n).toFixed(1)])));
for (const k of Object.keys(dmg).sort()) console.log(k.padEnd(24), 'hits/fight', (cnt[k]! / n).toFixed(1), 'dmg/fight', (dmg[k]! / n).toFixed(1));
