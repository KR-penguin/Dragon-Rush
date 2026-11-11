import {
  BOARD_SIZE,
  forwardDistance,
  ITEM_IDS,
  JOB_IDS,
  PASSIVES,
  PHASES,
  UPGRADE_STATS,
  upgradeCost,
  type PlayerState,
  type PublicGameState,
  type SeatId,
} from '@dragon-rush/engine';
import { GLOBAL_OFFSET, OBS_DIM, OBS_V1_SCALES as S, OPP_BLOCK, SELF_BLOCK } from './layout';

const n = (x: number, scale: number): number => Math.min(2, Math.max(0, x / scale));

class Writer {
  constructor(
    readonly buf: Float32Array,
    private i: number,
  ) {}
  put(v: number | boolean): void {
    this.buf[this.i++] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  oneHot(index: number, length: number): void {
    for (let k = 0; k < length; k++) this.put(k === index);
  }
  skip(length: number): void {
    this.i += length;
  }
}

const rageActive = (p: PlayerState) => PASSIVES[p.job].effectiveAtk !== undefined && 2 * p.hp <= p.maxHp;
const indomitableReady = (p: PlayerState) => PASSIVES[p.job].indomitable === true && !p.passive.indomitableUsed;
const ninjaCd = (p: PlayerState) => (PASSIVES[p.job].moveAdjust ? n(p.passive.ninjaCooldown, S.CD_S) : 0);

function writeSelf(w: Writer, view: PublicGameState, p: PlayerState): void {
  w.oneHot(JOB_IDS.indexOf(p.job), 5);
  if (!p.alive) {
    w.skip(SELF_BLOCK - 5);
    return;
  }
  w.oneHot(p.position, BOARD_SIZE);
  w.put(n(p.hp, S.HP_S));
  w.put(n(p.maxHp, S.HP_S));
  w.put(p.hp / p.maxHp);
  w.put(n(p.atk, S.ATK_S));
  w.put(n(p.def, S.DEF_S));
  w.put(n(p.coins, S.COIN_S));
  for (const stat of UPGRADE_STATS) w.put(n(p.upgradeLevels[stat], S.LVL_S));
  for (const stat of UPGRADE_STATS) w.put(n(upgradeCost(view.rules, p, stat), S.COIN_S));
  for (const item of ITEM_IDS) w.put(n(p.items[item], S.ITEM_S));
  for (const item of ITEM_IDS) w.put(p.items[item] >= 1);
  w.put(p.skipNextTurn);
  w.put(indomitableReady(p));
  w.put(rageActive(p));
  w.put(ninjaCd(p));
}

function writeOpponent(w: Writer, me: PlayerState, q: PlayerState | undefined): void {
  if (!q) {
    w.skip(OPP_BLOCK);
    return;
  }
  w.put(true);
  if (!q.alive) {
    w.skip(OPP_BLOCK - 1);
    return;
  }
  w.put(true);
  w.oneHot(JOB_IDS.indexOf(q.job), 5);
  w.oneHot(q.position, BOARD_SIZE);
  const fwd = forwardDistance(me.position, q.position);
  const back = forwardDistance(q.position, me.position);
  w.put(fwd / S.DIST_S);
  w.put(fwd === 0);
  w.put(fwd >= 1 && fwd <= 6);
  w.put(back >= 1 && back <= 6);
  w.put(n(q.hp, S.HP_S));
  w.put(n(q.maxHp, S.HP_S));
  w.put(q.hp / q.maxHp);
  w.put(n(q.atk, S.ATK_S));
  w.put(n(q.def, S.DEF_S));
  w.put(n(q.coins, S.COIN_S));
  for (const stat of UPGRADE_STATS) w.put(n(q.upgradeLevels[stat], S.LVL_S));
  for (const item of ITEM_IDS) w.put(n(q.items[item], S.ITEM_S));
  for (const item of ITEM_IDS) w.put(q.items[item] >= 1);
  w.put(q.skipNextTurn);
  w.put(indomitableReady(q));
  w.put(rageActive(q));
  w.put(ninjaCd(q));
}

const relative = (seat: SeatId, other: SeatId, count: number) => (other - seat + count) % count;

function writeGlobal(w: Writer, view: PublicGameState, seat: SeatId): void {
  const r = view.rules;
  const count = view.players.length;
  const max = r.maxRounds;
  w.put(n(view.round, S.ROUND_S));
  w.put(max === null ? 0 : n(max, S.ROUND_S));
  w.put(max === null ? 0 : (max - view.round + 1) / max);
  w.put(n(Math.max(0, r.pvpGraceRounds - view.round + 1), S.GRACE_S));
  w.put(view.round > r.pvpGraceRounds);
  w.oneHot(count - 2, 3);
  w.put(view.players.filter((p) => p.alive).length / 4);
  w.oneHot(view.pending ? PHASES.indexOf(view.pending.phase) : -1, 6);
  w.oneHot(view.pending ? relative(seat, view.current, count) : -1, 4);
  w.oneHot(view.turn.dice !== null ? view.turn.dice - 1 : -1, 6);
  w.put(view.turn.canBuy);
  w.put(view.turn.thiefUsed);
  w.put(n(view.turn.teleportsUsed, S.TP_S));
  const limit = r.items.teleport.perTurnLimit;
  w.put(limit !== null && view.turn.teleportsUsed >= limit);
  const pvp = view.pending ? view.pvp : null;
  w.put(pvp !== null && pvp.arriver === seat);
  w.put(pvp !== null && pvp.target === seat);
  let opp = -1;
  if (pvp && pvp.target !== null && (pvp.arriver === seat || pvp.target === seat)) {
    opp = relative(seat, pvp.arriver === seat ? pvp.target : pvp.arriver, count) - 1;
  }
  w.oneHot(opp, 3);
  w.put(n(r.dragon.hp, S.HP_S));
  w.put(n(r.dragon.atk, S.ATK_S));
  w.put(n(r.dragon.def, S.DEF_S));
  for (const item of ITEM_IDS) w.put(n(r.items[item].price, S.COIN_S));
}

/** obs_v1: ego-centric float32 vector from the acting seat's point of view (docs/ai-interface-spec.md §3). */
export function encodeObservation(view: PublicGameState, seat: SeatId): Float32Array {
  const buf = new Float32Array(OBS_DIM);
  const me = view.players[seat];
  if (!me) throw new RangeError(`no seat ${seat}`);
  writeSelf(new Writer(buf, 0), view, me);
  const count = view.players.length;
  for (let k = 1; k <= 3; k++) {
    const q = k < count ? view.players[(seat + k) % count] : undefined;
    writeOpponent(new Writer(buf, SELF_BLOCK + (k - 1) * OPP_BLOCK), me, q);
  }
  writeGlobal(new Writer(buf, GLOBAL_OFFSET), view, seat);
  return buf;
}
