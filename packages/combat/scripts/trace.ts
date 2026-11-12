/** Debug helper: tick-by-tick trace of one duel.  tsx scripts/trace.ts <jobA> <jobB> <seed> [maxTicks] */
import type { JobId } from '@dragon-rush/engine';
import { baseFighter } from '../test/calibration';
import {
  createCombat,
  createCombatBot,
  policyRandom,
  stepCombat,
  type CombatState,
  type FighterInput,
  type FighterState,
} from '../src/index';

const [ja, jb, seedS, maxS] = process.argv.slice(2) as [JobId, JobId, string, string | undefined];
const seed = Number(seedS ?? '1');
const maxTicks = Number(maxS ?? '900');
const bot = createCombatBot('balanced');
let s: CombatState = createCombat({ kind: 'duel', a: baseFighter(ja), b: baseFighter(jb) }, seed);
const ra = policyRandom(seed, 1);
const rb = policyRandom(seed, 2);
const f = (x: FighterState): string =>
  `${x.job.slice(0, 3)} ${(x.x / 256).toFixed(0)},${(x.y / 256).toFixed(0)} ${x.mode}/${x.move ?? '-'}/${x.phase}@${x.moveTick} hp${x.hp}`;
const inp = (i: FighterInput): string =>
  `${i.move}${i.attack ? 'A' : ''}${i.skill ? 'S' : ''}${i.dash ? 'D' : ''}`;
while (!s.outcome && s.tick < maxTicks) {
  const ia = bot.decide(s, 'a', ra);
  const ib = bot.decide(s, 'b', rb);
  const out = stepCombat(s, [ia, ib]);
  s = out.state;
  const b = s.b!;
  const d = Math.hypot(s.a.x - b.x, s.a.y - b.y) / 256;
  const ev = out.events
    .filter((e) => e.type !== 'ProjectileEnd')
    .map(
      (e) => e.type + ('kind' in e ? `:${String(e.kind)}` : '') + ('dmg' in e ? `:${e.dmg}` : ''),
    )
    .join(' ');
  if (s.tick % 4 === 0 || ev)
    console.log(s.tick, d.toFixed(0).padStart(4), '|', f(s.a), inp(ia), '|', f(b), inp(ib), ev);
}
