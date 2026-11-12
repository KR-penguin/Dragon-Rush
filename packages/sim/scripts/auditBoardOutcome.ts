import { predictOutcome } from '@dragon-rush/ai';
import { runBatch } from '../src/runner';
import { loadOutcomeModel } from '../src/outcome/load';

const path = process.argv[2]!;
const model = loadOutcomeModel(path);
const games = Number(process.argv[3] ?? 4000);
const records = runBatch({
  games,
  players: 4,
  bots: 'heuristic',
  baseSeed: 2026 * 1000 + 4,
  combat: 'sim',
  outcomeModelPath: path,
  logFights: true,
});
const groups = new Map<string, { n: number; predicted: number; observed: number }>();
for (const record of records) {
  for (const fight of record.fights ?? []) {
    const key = `${fight.setup.kind}/${fight.setup.a.job}/${fight.setup.b?.job ?? 'dragon'}`;
    const group = groups.get(key) ?? { n: 0, predicted: 0, observed: 0 };
    group.n++;
    group.predicted += predictOutcome(model, fight.setup).winA;
    group.observed += Number(fight.winner === 'a');
    groups.set(key, group);
  }
}
const summary = [...groups].map(([key, g]) => ({
  key,
  n: g.n,
  predicted: g.predicted / g.n,
  observed: g.observed / g.n,
  error: (g.predicted - g.observed) / g.n,
}));
summary.sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
console.log(JSON.stringify({ games, groups: summary }, null, 2));
