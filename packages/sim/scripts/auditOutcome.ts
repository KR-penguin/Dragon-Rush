import { readFileSync } from 'node:fs';
import { predictOutcome } from '@dragon-rush/ai';
import { generateOutcomeRows, outcomeCalibration } from '../src/outcome';
import { loadOutcomeModel } from '../src/outcome/load';
import { StatDistSchema } from '../src/statDist';

const dist = StatDistSchema.parse(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const model = loadOutcomeModel(process.argv[3]!);
const count = Number(process.argv[4] ?? 10000);
const rows = generateOutcomeRows(dist, { seed: 9901, count });
const groups = new Map<string, { n: number; predicted: number; observed: number }>();
for (const row of rows) {
  const key = `${row.setup.kind}/${row.setup.a.job}/${row.setup.b?.job ?? 'dragon'}`;
  const group = groups.get(key) ?? { n: 0, predicted: 0, observed: 0 };
  group.n++;
  group.predicted += predictOutcome(model, row.setup).winA;
  group.observed += Number(row.result.winner === 'a');
  groups.set(key, group);
}
const summary = [...groups].map(([key, g]) => ({
  key,
  n: g.n,
  predicted: g.predicted / g.n,
  observed: g.observed / g.n,
  error: (g.predicted - g.observed) / g.n,
}));
summary.sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
console.log(
  JSON.stringify({ calibration: outcomeCalibration(model, rows), groups: summary }, null, 2),
);
