import type { CombatEvent } from '@dragon-rush/combat';
import { EVENT_LATE_SFX_TICKS, EVENT_REBIND_WINDOW } from '../constants';

/**
 * play    : new predicted event, play SFX/sparks now
 * late    : new event first seen too late for SFX (> 7 ticks old): apply persistent state only
 * rebind  : a re-simulated event that moved a few ticks: move the spark/number, never replay
 * vanish  : a predicted event that no longer happens: fade out, no undo animation
 * confirm : the event is on the authoritative timeline (KO text, result, stingers wait for this)
 */
export type PresentKind = 'play' | 'late' | 'rebind' | 'vanish' | 'confirm';

export interface PresentCommand {
  readonly kind: PresentKind;
  readonly event: CombatEvent;
  /** rebind: the id the event had before. */
  readonly previousId?: string;
}

const ownerOfEntity = (entity: number): string => ['a', 'b', 'dragon', '?'][(entity % 256) >> 6] ?? '?';

/** Tick-free identity of an event: type + actor + move/kind + target (entity ids and ticks stripped). */
export function eventSignature(e: CombatEvent): string {
  switch (e.type) {
    case 'AttackStart':
      return `${e.type}:${e.who}:${e.move}`;
    case 'SkillUsed':
      return `${e.type}:${e.who}:${e.skill}`;
    case 'Dash':
      return `${e.type}:${e.who}:${e.dash}`;
    case 'ProjectileSpawn':
      return `${e.type}:${e.owner}:${e.kind}`;
    case 'ProjectileEnd':
      return `${e.type}:${ownerOfEntity(e.entity)}:${e.reason}`;
    case 'Hit':
      return `${e.type}:${e.attacker}:${e.target}:${e.kind}`;
    case 'Parry':
    case 'Evade':
      return `${e.type}:${e.who}:${e.attacker}:${e.kind}`;
    case 'LastStand':
    case 'RageOn':
    case 'KO':
    case 'WallSlam':
      return `${e.type}:${e.who}`;
    case 'TelegraphStart':
    case 'TelegraphEnd':
      return `${e.type}:${e.kind}`;
    case 'PhaseChange':
      return `${e.type}:${e.phase}`;
    default:
      return e.type;
  }
}

interface Entry {
  event: CombatEvent;
  readonly sig: string;
}

export interface ReconcilerStats {
  plays: number;
  lates: number;
  rebinds: number;
  vanishes: number;
  confirms: number;
  phantomKos: number;
}

/**
 * Presentation bookkeeping for a rollback timeline. Sounds and effects are never triggered from inside
 * the sim; only this reconciler emits commands. Matching after a re-simulation: exact id, then signature
 * within ±6 ticks (rebind), then new (play or late); leftovers vanish.
 */
export class EventReconciler {
  private readonly table = new Map<number, Entry[]>();
  private orphans: (Entry & { tick: number })[] | null = null;
  private out: PresentCommand[] = [];
  readonly stats: ReconcilerStats = { plays: 0, lates: 0, rebinds: 0, vanishes: 0, confirms: 0, phantomKos: 0 };

  /** Ticks >= from are about to be re-simulated: their presented events become candidates for matching. */
  beginResim(from: number): void {
    const orphans = this.orphans ?? [];
    for (const [tick, entries] of this.table) {
      if (tick < from) continue;
      for (const e of entries) orphans.push({ ...e, tick });
      this.table.delete(tick);
    }
    this.orphans = orphans;
  }

  /** Events produced by stepping `tick`; `nowTick` is the tick the player is looking at. */
  add(tick: number, events: readonly CombatEvent[], nowTick: number): void {
    if (events.length === 0) return;
    let list = this.table.get(tick);
    if (!list) {
      list = [];
      this.table.set(tick, list);
    }
    for (const event of events) {
      const sig = eventSignature(event);
      const orphans = this.orphans;
      if (orphans && orphans.length > 0) {
        const exact = orphans.findIndex((o) => o.event.id === event.id);
        if (exact >= 0) {
          orphans.splice(exact, 1);
          list.push({ event, sig });
          continue;
        }
        let best = -1;
        let bestDist = EVENT_REBIND_WINDOW + 1;
        orphans.forEach((o, i) => {
          const d = Math.abs(o.tick - tick);
          if (o.sig === sig && d < bestDist) {
            best = i;
            bestDist = d;
          }
        });
        if (best >= 0) {
          const [old] = orphans.splice(best, 1);
          list.push({ event, sig });
          this.stats.rebinds += 1;
          this.out.push({ kind: 'rebind', event, previousId: old!.event.id });
          continue;
        }
      }
      list.push({ event, sig });
      const late = nowTick - tick > EVENT_LATE_SFX_TICKS;
      if (late) this.stats.lates += 1;
      else this.stats.plays += 1;
      this.out.push({ kind: late ? 'late' : 'play', event });
    }
  }

  endResim(): void {
    const orphans = this.orphans;
    this.orphans = null;
    if (!orphans) return;
    for (const o of orphans) {
      this.stats.vanishes += 1;
      if (o.event.type === 'KO') this.stats.phantomKos += 1;
      this.out.push({ kind: 'vanish', event: o.event });
    }
  }

  /** The slot for `tick` is authoritative now. */
  confirm(tick: number, events: readonly CombatEvent[]): void {
    this.table.delete(tick);
    for (const event of events) {
      this.stats.confirms += 1;
      this.out.push({ kind: 'confirm', event });
    }
  }

  drain(): PresentCommand[] {
    const out = this.out;
    this.out = [];
    return out;
  }
}
