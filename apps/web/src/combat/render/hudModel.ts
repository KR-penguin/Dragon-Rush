import { COMBAT_TICK_HZ, type CombatState, type FighterState } from '@dragon-rush/combat';

/** HP bar ghost (art-direction §10): the lost part stays white for 400 ms, then drains. */
export const GHOST_HOLD_MS = 400;
export const GHOST_DRAIN_MS = 350;

export interface Ghost {
  readonly value: number;
  /** Ghost level when the last damage landed. */
  readonly from: number;
  readonly since: number;
}

export function ghostAt(g: Ghost, now: number): number {
  const t = (now - g.since - GHOST_HOLD_MS) / GHOST_DRAIN_MS;
  const k = Math.min(1, Math.max(0, t));
  return g.from + (g.value - g.from) * k;
}

/** New damage restarts the hold from wherever the ghost is; healing snaps it. */
export function trackGhost(g: Ghost | null, value: number, now: number): Ghost {
  if (!g || value >= g.value) return { value, from: value, since: now };
  if (value === g.value) return g;
  return { value, from: Math.max(value, ghostAt(g, now)), since: now };
}

export const secondsLeft = (s: CombatState): number =>
  Math.max(0, Math.ceil((s.timeLimit - s.tick) / COMBAT_TICK_HZ));

export interface CooldownView {
  readonly charges: number;
  readonly maxCharges: number;
  /** 0 = ready (or full), 1 = just used; the recharge of the next charge. */
  readonly remaining: number;
}

export function skillCooldown(s: CombatState, f: FighterState): CooldownView {
  const kit = s.rules.jobs[f.job];
  const remaining =
    f.skillCharges >= kit.skillCharges
      ? 0
      : Math.min(1, f.skillTimer / Math.max(1, kit.skillCooldown));
  return { charges: f.skillCharges, maxCharges: kit.skillCharges, remaining };
}

export function dashCooldown(s: CombatState, f: FighterState): CooldownView {
  const d = s.rules.dashes[s.rules.jobs[f.job].dash];
  const full = d.cooldown + d.ticks;
  const remaining = f.dashCharges >= d.charges ? 0 : Math.min(1, f.dashTimer / Math.max(1, full));
  return { charges: f.dashCharges, maxCharges: d.charges, remaining };
}

/** Passive state per job for the HUD pips (불굴 방패, 선제 화살, 회피 8칸, 광폭, 관통). */
export type PassivePip =
  | { readonly kind: 'lastStand'; readonly state: 'ready' | 'used' | 'gone' }
  | { readonly kind: 'firstStrike'; readonly ready: boolean }
  | { readonly kind: 'evade'; readonly count: number; readonly every: number }
  | { readonly kind: 'rage'; readonly on: boolean }
  | { readonly kind: 'pierce' };

export function passivePip(s: CombatState, f: FighterState): PassivePip {
  switch (f.job) {
    case 'swordsman':
      return {
        kind: 'lastStand',
        state: f.lastStandUsed ? 'used' : f.lastStandAvailable ? 'ready' : 'gone',
      };
    case 'archer':
      return { kind: 'firstStrike', ready: f.firstStrikePending };
    case 'ninja':
      return { kind: 'evade', count: f.evadeCounter, every: s.rules.passives.ninjaEvadeEvery };
    case 'berserker':
      return { kind: 'rage', on: f.raging };
    case 'mage':
      return { kind: 'pierce' };
  }
}

/**
 * Dragon intent (board rule "every 3rd damaging maneuver is Breath"): `filled` maneuvers done since
 * the last Breath; `imminent` when the next damaging maneuver is the Breath.
 */
export function breathPips(s: CombatState): {
  readonly filled: number;
  readonly total: number;
  readonly imminent: boolean;
} {
  const total = s.rules.dragon.breathEvery;
  const filled = Math.min(total - 1, s.dragon?.sinceBreath ?? 0);
  return { filled, total, imminent: filled >= total - 1 };
}
