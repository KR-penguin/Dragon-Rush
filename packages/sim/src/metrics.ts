import { ITEM_IDS, JOB_IDS, type JobId } from '@hero-dice/engine';
import type { GameRecord } from './runner';

export interface Metrics {
  games: number;
  players: number;
  avgRounds: number;
  medianRounds: number;
  p95Rounds: number;
  dragonEndShare: number;
  drawShare: number;
  jobWinRate: Record<JobId, number | null>;
  earlyEliminationShare: number;
  dragonSuccessRate: number;
  avgDragonWinRound: number | null;
  pvpPerGame: number;
  shieldCancelsPerGame: number;
  purchasesPerGame: Record<string, number>;
  netCoinsPerTurn: number;
  policyWinRate: Record<string, number>;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

export function summarize(records: GameRecord[]): Metrics {
  const g = records.length;
  const rounds = records.map((r) => r.rounds).sort((a, b) => a - b);
  const jobGames: Record<string, number> = {};
  const jobWins: Record<string, number> = {};
  const policyGames: Record<string, number> = {};
  const policyWins: Record<string, number> = {};
  let early = 0;
  let seats = 0;
  let turns = 0;
  let coins = 0;
  const dragonWinRounds: number[] = [];
  for (const r of records) {
    r.jobs.forEach((job, seat) => {
      jobGames[job] = (jobGames[job] ?? 0) + 1;
      const pid = r.policies[seat]!;
      policyGames[pid] = (policyGames[pid] ?? 0) + 1;
      if (r.winner === seat) {
        jobWins[job] = (jobWins[job] ?? 0) + 1;
        policyWins[pid] = (policyWins[pid] ?? 0) + 1;
      }
    });
    seats += r.jobs.length;
    early += r.eliminations.filter((e) => e.round <= 3).length;
    turns += r.turns.reduce((a, b) => a + b, 0);
    coins += r.netCoins.reduce((a, b) => a + b, 0);
    if (r.outcome === 'dragon') dragonWinRounds.push(r.rounds);
  }
  const attempts = records.reduce((a, r) => a + r.dragonAttempts, 0);
  const wins = records.reduce((a, r) => a + r.dragonWins, 0);
  const jobWinRate = Object.fromEntries(
    JOB_IDS.map((j) => [j, jobGames[j] ? (jobWins[j] ?? 0) / jobGames[j]! : null]),
  ) as Record<JobId, number | null>;
  return {
    games: g,
    players: records[0]?.jobs.length ?? 0,
    avgRounds: rounds.reduce((a, b) => a + b, 0) / g,
    medianRounds: quantile(rounds, 0.5),
    p95Rounds: quantile(rounds, 0.95),
    dragonEndShare: records.filter((r) => r.outcome === 'dragon').length / g,
    drawShare: records.filter((r) => r.outcome === 'draw').length / g,
    jobWinRate,
    earlyEliminationShare: early / seats,
    dragonSuccessRate: attempts ? wins / attempts : 0,
    avgDragonWinRound: dragonWinRounds.length ? dragonWinRounds.reduce((a, b) => a + b, 0) / dragonWinRounds.length : null,
    pvpPerGame: records.reduce((a, r) => a + r.pvpFights, 0) / g,
    shieldCancelsPerGame: records.reduce((a, r) => a + r.shieldCancels, 0) / g,
    purchasesPerGame: Object.fromEntries(ITEM_IDS.map((i) => [i, records.reduce((a, r) => a + r.purchases[i], 0) / g])),
    netCoinsPerTurn: coins / turns,
    policyWinRate: Object.fromEntries(Object.keys(policyGames).map((p) => [p, (policyWins[p] ?? 0) / policyGames[p]!])),
  };
}

const pct = (x: number | null) => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null, d = 2) => (x === null ? '-' : x.toFixed(d));

export function formatMetrics(m: Metrics): string {
  const lines = [
    `## ${m.players}인 ${m.games}판`,
    '',
    '| 지표 | 값 |',
    '|---|---|',
    `| 평균 라운드 (중앙값) / p95 | ${num(m.avgRounds, 1)} (${m.medianRounds}) / ${m.p95Rounds} |`,
    `| 용 처치 종료 / 무승부 | ${pct(m.dragonEndShare)} / ${pct(m.drawShare)} |`,
    `| 직업 승률 검/궁/마/닌/광 | ${JOB_IDS.map((j) => pct(m.jobWinRate[j])).join(' / ')} |`,
    `| 3라운드 내 탈락 비율 | ${pct(m.earlyEliminationShare)} |`,
    `| 용 도전 성공률 / 처치 평균 라운드 | ${pct(m.dragonSuccessRate)} / ${num(m.avgDragonWinRound, 1)} |`,
    `| 판당 PvP 전투 / 방어막 취소 | ${num(m.pvpPerGame)} / ${num(m.shieldCancelsPerGame)} |`,
    `| 판당 구매 tp / sh / th | ${ITEM_IDS.map((i) => num(m.purchasesPerGame[i] ?? 0)).join(' / ')} |`,
    `| 턴당 순 코인 | ${num(m.netCoinsPerTurn)} |`,
    `| 정책별 승률 | ${Object.entries(m.policyWinRate).map(([p, w]) => `${p} ${pct(w)}`).join(', ')} |`,
  ];
  return lines.join('\n');
}
