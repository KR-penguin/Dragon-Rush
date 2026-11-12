/**
 * Calibration aid: searches per-job damage multipliers (`jobpower.<job>`) that pull every job's average duel
 * win rate toward 50%. Prints the multipliers to bake into DEFAULT_COMBAT_RULES move powers.
 *   tsx scripts/autobalance.ts [--n 300] [--iters 6] [--set path=value ...]
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import type { JobId } from '@dragon-rush/engine';
import { baseFighter, JOBS, mean } from '../test/calibration';
import type { Task, TaskResult } from './calibrateWorker';
import { favouredJob } from '../src/matchups';

const argv = process.argv.slice(2);
const flag = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? def) : def;
};
const base: string[] = [];
argv.forEach((a, i) => {
  if (a === '--set' && argv[i + 1]) base.push(argv[i + 1]!);
});
const N = Number(flag('n', '300'));
const iters = Number(flag('iters', '6'));
const gain = Number(flag('gain', '1.2'));

async function matrix(sets: string[]): Promise<Map<string, TaskResult>> {
  const tasks: Task[] = [];
  for (const i of JOBS)
    for (const j of JOBS)
      tasks.push({
        key: `${i}:${j}`,
        setup: { kind: 'duel', a: baseFighter(i), b: baseFighter(j) },
        n: N,
        seed0: 1,
        styleA: 'balanced',
        styleB: 'balanced',
      });
  const workers = Math.min(cpus().length - 2, tasks.length);
  const buckets: Task[][] = Array.from({ length: workers }, () => []);
  tasks.forEach((t, k) => buckets[k % workers]!.push(t));
  const url = new URL('./calibrateWorker.ts', import.meta.url);
  const res = await Promise.all(
    buckets.map(
      (b) =>
        new Promise<TaskResult[]>((resolve, reject) => {
          const w = new Worker(url, {
            workerData: { tasks: b, sets },
            execArgv: ['--import', 'tsx'],
          });
          w.once('message', resolve);
          w.once('error', reject);
        }),
    ),
  );
  return new Map(res.flat().map((r) => [r.key, r]));
}

async function main(): Promise<void> {
  const mult: Record<string, number> = Object.fromEntries(JOBS.map((j) => [j, 1]));
  for (let it = 0; it <= iters; it++) {
    const sets = [...base, ...JOBS.map((j) => `jobpower.${j}=${mult[j]!.toFixed(3)}`)];
    const r = await matrix(sets);
    const rate = (i: JobId, j: JobId): number => {
      const ij = r.get(`${i}:${j}`)!;
      const ji = r.get(`${j}:${i}`)!;
      return (ij.winsA + (ji.ticks.length - ji.winsA)) / (ij.ticks.length + ji.ticks.length);
    };
    const all = [...r.values()].flatMap((x) => x.ticks);
    console.log(
      `\niter ${it}  mult ${JOBS.map((j) => `${j}=${mult[j]!.toFixed(2)}`).join(' ')}  len ${(mean(all) / 60).toFixed(1)}s`,
    );
    let worst = 0;
    for (const i of JOBS) {
      const row = JOBS.map((j) => {
        if (i === j) return '  -- ';
        const mark = favouredJob(i, j) === i ? '+' : '-';
        return `${(100 * rate(i, j)).toFixed(0).padStart(3)}%${mark}`;
      });
      const avg = mean(JOBS.filter((j) => j !== i).map((j) => rate(i, j)));
      for (const j of JOBS)
        if (i !== j)
          worst = Math.max(worst, Math.abs(rate(i, j) - (favouredJob(i, j) === i ? 0.63 : 0.37)));
      console.log(`${i.padEnd(10)} ${row.join(' ')}   avg ${(100 * avg).toFixed(0)}%`);
      mult[i] = mult[i]! * Math.exp(gain * (0.5 - avg));
    }
    console.log(`worst pair off target (63/37) by ${(100 * worst).toFixed(0)} pts`);
  }
}

void main();
