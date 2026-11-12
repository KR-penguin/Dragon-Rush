import { readFileSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { DEFAULT_COMBAT_RULES } from '@dragon-rush/combat';
import { StatDistSchema } from '../statDist';
import { fitOutcomeModel, generateOutcomeRows, outcomeCalibration, type OutcomeRow } from './index';

interface Args {
  statDist: string;
  model: string;
  rows?: string;
  report?: string;
  seed: number;
  count: number;
  epochs: number;
  workers: number;
  bot: string;
  id: string;
  requireCalibration: boolean;
}

function parse(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === '--require-calibration') {
      values.set(flag, 'true');
      continue;
    }
    if (!flag.startsWith('--') || !argv[i + 1]) throw new Error(`invalid argument ${flag}`);
    values.set(flag, argv[++i]!);
  }
  const statDist = values.get('--stat-dist');
  const model = values.get('--model');
  if (!statDist || !model)
    throw new Error(
      'usage: pnpm outcome --stat-dist <stat_dist_v1.json> --model <outcome_v1.json> [--count 200000] [--seed 1] [--epochs 30] [--workers 1]',
    );
  const args: Args = {
    statDist,
    model,
    seed: Number(values.get('--seed') ?? 1),
    count: Number(values.get('--count') ?? 200000),
    epochs: Number(values.get('--epochs') ?? 30),
    workers: Number(values.get('--workers') ?? 1),
    bot: values.get('--bot') ?? 'scripted:balanced',
    id: values.get('--id') ?? 'outcome-v1',
    requireCalibration: values.has('--require-calibration'),
  };
  if (values.has('--rows')) args.rows = values.get('--rows');
  if (values.has('--report')) args.report = values.get('--report');
  if (
    ![args.seed, args.count, args.epochs, args.workers].every(Number.isSafeInteger) ||
    args.seed < 0 ||
    args.count < 2 ||
    args.epochs < 1 ||
    args.workers < 1
  )
    throw new RangeError('invalid numeric option');
  return args;
}

function workerRows(
  dist: ReturnType<typeof StatDistSchema.parse>,
  seed: number,
  count: number,
  bot: string,
): Promise<OutcomeRow[]> {
  const isTs = import.meta.url.endsWith('.ts');
  const url = new URL(isTs ? './worker.ts' : './worker.js', import.meta.url);
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, {
      workerData: { dist, options: { seed, count, bot } },
      execArgv: isTs ? ['--import', 'tsx'] : [],
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`outcome worker exited ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  const raw: unknown = JSON.parse(readFileSync(args.statDist, 'utf8'));
  const dist = StatDistSchema.parse(raw);
  const chunks = Math.min(args.workers, args.count);
  const rows =
    chunks === 1
      ? generateOutcomeRows(dist, { seed: args.seed, count: args.count, bot: args.bot })
      : (
          await Promise.all(
            Array.from({ length: chunks }, (_, i) =>
              workerRows(
                dist,
                args.seed + i,
                Math.floor(args.count / chunks) + Number(i < args.count % chunks),
                args.bot,
              ),
            ),
          )
        ).flat();
  const fit = fitOutcomeModel(rows, {
    seed: args.seed,
    epochs: args.epochs,
    id: args.id,
    rulesVersion: dist.rules_version,
    combatRulesVersion: DEFAULT_COMBAT_RULES.version,
    statDistGames: dist.games,
    bot: args.bot,
  });
  const report = outcomeCalibration(fit.model, fit.holdout);
  writeFileSync(args.model, JSON.stringify(fit.model) + '\n');
  if (args.rows)
    writeFileSync(args.rows, JSON.stringify({ version: 'outcome_rows_v1', rows }) + '\n');
  if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2) + '\n');
  process.stderr.write(
    `outcome ${fit.model.id}: ${rows.length} fights, ${fit.holdout.length} holdout, Brier ${report.brier.toFixed(4)}, max decile error ${report.maxError?.toFixed(4) ?? 'n/a'}, gate ${report.passes ? 'pass' : 'fail'}\n`,
  );
  if (args.requireCalibration && !report.passes) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
