import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { formatMetrics, summarize } from './metrics';
import { runBatch, type BatchOptions, type GameRecord } from './runner';

interface CliArgs {
  games: number;
  players: number[];
  bots: string;
  seed: number;
  workers: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { games: 1000, players: [4], bots: 'heuristic', seed: 1, workers: Math.max(1, availableParallelism() - 2), json: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--games') args.games = Number(value);
    else if (flag === '--players') args.players = String(value).split(',').map(Number);
    else if (flag === '--bots') args.bots = String(value);
    else if (flag === '--seed') args.seed = Number(value);
    else if (flag === '--workers') args.workers = Number(value);
    else if (flag === '--json') {
      args.json = true;
      continue;
    } else continue;
    i++;
  }
  return args;
}

function runInWorker(opts: BatchOptions): Promise<GameRecord[]> {
  const isTs = import.meta.url.endsWith('.ts');
  const url = new URL(isTs ? './simWorker.ts' : './simWorker.js', import.meta.url);
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, { workerData: opts, execArgv: isTs ? ['--import', 'tsx'] : [] });
    worker.once('message', (records: GameRecord[]) => resolve(records));
    worker.once('error', reject);
  });
}

async function runParallel(base: Omit<BatchOptions, 'startIndex' | 'games'>, games: number, workers: number): Promise<GameRecord[]> {
  if (workers <= 1 || games < 50) return runBatch({ ...base, games });
  const chunk = Math.ceil(games / workers);
  const jobs: Promise<GameRecord[]>[] = [];
  for (let start = 0; start < games; start += chunk) {
    jobs.push(runInWorker({ ...base, games: Math.min(chunk, games - start), startIndex: start }));
  }
  return (await Promise.all(jobs)).flat();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports = [];
  for (const players of args.players) {
    const started = performance.now();
    const records = await runParallel({ players, bots: args.bots, baseSeed: args.seed * 1000 + players }, args.games, args.workers);
    const metrics = summarize(records);
    reports.push(metrics);
    if (!args.json) {
      console.log(formatMetrics(metrics));
      console.log(`\n(${((performance.now() - started) / 1000).toFixed(1)}s, bots=${args.bots}, seed=${args.seed})\n`);
    }
  }
  if (args.json) console.log(JSON.stringify(reports, null, 2));
}

void main();
