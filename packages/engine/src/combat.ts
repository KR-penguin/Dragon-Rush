import { PASSIVES } from './jobs';
import type { CombatKind, CombatantRef, GameEvent, JobId, RulesConfig } from './types';

export interface Fighter {
  ref: CombatantRef;
  job: JobId | null;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  indomitableAvailable: boolean;
}

export interface CombatResult {
  a: Fighter;
  b: Fighter;
  winner: 'a' | 'b';
  capReached: boolean;
  events: GameEvent[];
}

export interface CombatOptions {
  kind: CombatKind;
  /** Who strikes first when no archer is involved (arriver in duels, the player in dragon fights). */
  defaultFirst: 'a' | 'b';
  /** Winner when the exchange cap is hit in a duel and hp ratios tie. */
  capTieWinner: 'a' | 'b';
  /** In dragon fights the challenger loses on cap; this marks which side that is. */
  capLoser?: 'a' | 'b';
}

const other = (side: 'a' | 'b'): 'a' | 'b' => (side === 'a' ? 'b' : 'a');

export function pickFirst(a: Fighter, b: Fighter, defaultFirst: 'a' | 'b'): 'a' | 'b' {
  const aFirst = a.job !== null && PASSIVES[a.job].alwaysFirst === true;
  const bFirst = b.job !== null && PASSIVES[b.job].alwaysFirst === true;
  if (aFirst && !bFirst) return 'a';
  if (bFirst && !aFirst) return 'b';
  return defaultFirst;
}

/** Fully resolves a fight. `roll(sides)` is the only randomness source (1d6 damage, then 1d8 evade for ninjas). */
export function resolveCombat(
  rules: RulesConfig,
  attackerA: Fighter,
  defenderB: Fighter,
  opts: CombatOptions,
  roll: (sides: number) => number,
): CombatResult {
  const f = { a: { ...attackerA }, b: { ...defenderB } };
  const events: GameEvent[] = [];
  const first = pickFirst(f.a, f.b, opts.defaultFirst);
  const attacksMade = { a: 0, b: 0 };
  events.push({ type: 'CombatStarted', kind: opts.kind, a: f.a.ref, b: f.b.ref, first: f[first].ref });

  let side = first;
  const maxAttacks = rules.combat.maxExchanges * 2;
  for (let n = 0; n < maxAttacks; n++) {
    const att = f[side];
    const def = f[other(side)];
    attacksMade[side] += 1;
    const isDragon = att.ref === 'dragon';
    const breath = isDragon && attacksMade[side] % rules.dragon.breathEvery === 0;
    const hooks = att.job ? PASSIVES[att.job] : {};
    const eff = hooks.effectiveAtk ? hooks.effectiveAtk(rules, att.atk, att.hp, att.maxHp) : { atk: att.atk, rage: false };
    let defEff = def.def;
    if (breath) defEff = 0;
    else if (hooks.pierce) defEff = hooks.pierce(rules, def.def);
    const dieRoll = roll(rules.combat.dieSides);
    let damage = Math.max(1, eff.atk + dieRoll - defEff);
    const firstStrike = attacksMade[side] === 1 && hooks.firstStrikeBonus !== undefined;
    if (firstStrike && hooks.firstStrikeBonus) damage += hooks.firstStrikeBonus(rules);
    let evaded = false;
    const defHooks = def.job ? PASSIVES[def.job] : {};
    if (defHooks.evadeDie && roll(defHooks.evadeDie(rules)) === 1) {
      evaded = true;
      damage = 0;
    }
    if (evaded && typeof def.ref === 'number') {
      events.push({ type: 'PassiveTriggered', seat: def.ref, passive: 'evade' });
    }
    if (def.hp - damage <= 0 && damage > 0 && def.indomitableAvailable) {
      def.hp = 1;
      def.indomitableAvailable = false;
      if (typeof def.ref === 'number') events.push({ type: 'PassiveTriggered', seat: def.ref, passive: 'indomitable' });
    } else {
      def.hp -= damage;
    }
    events.push({
      type: 'CombatHit',
      kind: opts.kind,
      attacker: att.ref,
      defender: def.ref,
      roll: dieRoll,
      damage,
      evaded,
      breath,
      rage: eff.rage,
      firstStrike,
      hpAfter: def.hp,
    });
    if (def.hp <= 0) {
      const winner = side;
      events.push({ type: 'CombatEnded', kind: opts.kind, winner: att.ref, loser: def.ref, capReached: false });
      return { a: f.a, b: f.b, winner, capReached: false, events };
    }
    side = other(side);
  }

  let winner: 'a' | 'b';
  if (opts.capLoser) winner = other(opts.capLoser);
  else {
    const ra = f.a.hp / f.a.maxHp;
    const rb = f.b.hp / f.b.maxHp;
    winner = ra > rb ? 'a' : rb > ra ? 'b' : opts.capTieWinner;
  }
  events.push({ type: 'CombatEnded', kind: opts.kind, winner: f[winner].ref, loser: f[other(winner)].ref, capReached: true });
  return { a: f.a, b: f.b, winner, capReached: true, events };
}
