import { createCombatBot, runCombat } from '@dragon-rush/combat';
import { DEFAULT_RULES, JOB_IDS } from '@dragon-rush/engine';
import { MATCHUPS } from '@dragon-rush/combat';

const n = Number(process.argv[2] ?? 300);
const interval = Number(process.argv[3] ?? 1);
const fighter = (job: (typeof JOB_IDS)[number]) => {
  const j = DEFAULT_RULES.jobs[job];
  return { job, hp: j.hp, maxHp: j.hp, atk: j.atk, def: j.def, indomitableAvailable: true };
};
for (const job of JOB_IDS) {
  for (const edge of MATCHUPS[job]) {
    let wins = 0;
    for (let i = 1; i <= n; i++) {
      const bot = createCombatBot('balanced', { reaction: i % 2 ? 10 : 16 });
      if (
        runCombat(
          { kind: 'duel', a: fighter(job), b: fighter(edge.beats) },
          [bot, bot],
          i,
          undefined,
          { decisionInterval: interval },
        ).result.winner === 'a'
      )
        wins++;
      if (
        runCombat(
          { kind: 'duel', a: fighter(edge.beats), b: fighter(job) },
          [bot, bot],
          i,
          undefined,
          { decisionInterval: interval },
        ).result.winner === 'b'
      )
        wins++;
    }
    console.log(`${job} > ${edge.beats}: ${(wins / (2 * n)).toFixed(3)}`);
  }
}
