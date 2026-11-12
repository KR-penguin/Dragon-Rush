/** Paired fight event totals for one matchup: tsx scripts/diagnose.ts <jobA> <jobB> [n=200] [reaction=10]. */
import type { JobId } from '@dragon-rush/engine';
import { baseFighter, JOBS } from '../test/calibration';
import { createCombatBot, runCombat, type CombatEvent } from '../src/index';

const [jobAStr, jobBStr, nStr = '200', reactionStr = '10'] = process.argv.slice(2);
const valid = (job: string | undefined): job is JobId => JOBS.includes(job as JobId);
if (!valid(jobAStr) || !valid(jobBStr)) throw new Error('pass two valid job ids');
const jobA = jobAStr;
const jobB = jobBStr;
const n = Number(nStr);
const reaction = Number(reactionStr);
if (!Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(reaction) || reaction < 0)
  throw new Error('n and reaction must be nonnegative integers');

type Totals = Record<string, number>;
const eventsByJob: Record<JobId, Totals> = Object.fromEntries(JOBS.map((job) => [job, {}])) as Record<JobId, Totals>;
const add = (job: JobId, key: string, amount = 1): void => {
  const totals = eventsByJob[job];
  totals[key] = (totals[key] ?? 0) + amount;
};
const count = (event: CombatEvent, a: JobId, b: JobId): void => {
  const job = (side: 'a' | 'b') => side === 'a' ? a : b;
  switch (event.type) {
    case 'Hit':
      if (event.attacker === 'a' || event.attacker === 'b') {
        const source = job(event.attacker);
        add(source, `hit:${event.kind}`);
        add(source, `damage:${event.kind}`, event.dmg);
      }
      break;
    case 'SkillUsed': add(job(event.who), `skill:${event.skill}`); break;
    case 'AttackStart': add(job(event.who), `attack:${event.move}`); break;
    case 'Dash': add(job(event.who), `dash:${event.dash}`); break;
    case 'Parry': add(job(event.who), `parry:${event.kind}`); break;
    case 'TelegraphStart':
      if (event.kind === 'meteor') add('mage', 'meteorMarks');
      break;
  }
};

let winsA = 0;
let timeouts = 0;
let totalTicks = 0;
const bot = createCombatBot('balanced', { reaction });
for (let seed = 1; seed <= n; seed++) {
  for (const swapped of [false, true]) {
    const a = swapped ? jobB : jobA;
    const b = swapped ? jobA : jobB;
    const result = runCombat(
      { kind: 'duel', a: baseFighter(a), b: baseFighter(b) },
      [bot, bot], seed, undefined, { recordEvents: true },
    );
    if ((result.result.winner === 'a' ? a : b) === jobA) winsA++;
    if (result.result.timedOut) timeouts++;
    totalTicks += result.ticks;
    for (const event of result.events ?? []) count(event, a, b);
  }
}
const rounds = 2 * n;
console.log(JSON.stringify({
  pair: [jobA, jobB], rounds, winPctA: 100 * winsA / rounds,
  timeoutPct: 100 * timeouts / rounds, meanSeconds: totalTicks / rounds / 60,
  eventsPerFight: Object.fromEntries([jobA, jobB].map((job) => [job,
    Object.fromEntries(Object.entries(eventsByJob[job]).map(([key, value]) => [key, Number((value / rounds).toFixed(2))]))])),
}, null, 2));
