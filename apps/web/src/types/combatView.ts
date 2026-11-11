import type {
  CombatKind,
  CombatantRef,
  GameEvent,
  PublicGameState,
  SeatId,
} from '@dragon-rush/engine';

export type HitBadge = 'firstStrike' | 'rage' | 'breath' | 'evade' | 'indomitable';

export const HIT_BADGE_LABEL: Record<HitBadge, string> = {
  firstStrike: '선제',
  rage: '광폭화',
  breath: '브레스',
  evade: '회피',
  indomitable: '불굴',
};

export interface CombatantView {
  readonly ref: CombatantRef;
  readonly hp: number;
  readonly maxHp: number;
}

export interface HitView {
  readonly index: number;
  readonly attacker: CombatantRef;
  readonly defender: CombatantRef;
  readonly roll: number;
  readonly damage: number;
  readonly hpAfter: number;
  readonly badges: readonly HitBadge[];
}

export interface CombatView {
  readonly kind: CombatKind;
  readonly a: CombatantView;
  readonly b: CombatantView;
  readonly first: CombatantRef;
  readonly hits: readonly HitView[];
  readonly winner: CombatantRef | null;
  readonly capReached: boolean;
  readonly eliminated: SeatId | null;
  /** Indomitable is announced before the hit it saves, so it is held until that hit arrives. */
  readonly pendingIndomitable: boolean;
}

function combatant(ref: CombatantRef, display: PublicGameState): CombatantView {
  if (ref === 'dragon') return { ref, hp: display.rules.dragon.hp, maxHp: display.rules.dragon.hp };
  const p = display.players.find((x) => x.seat === ref);
  return { ref, hp: p?.hp ?? 0, maxHp: p?.maxHp ?? 1 };
}

const withHp = (c: CombatantView, ref: CombatantRef, hp: number): CombatantView =>
  c.ref === ref ? { ...c, hp: Math.max(0, hp) } : c;

/**
 * Folds the event currently being shown into the combat overlay model.
 * Returns null when no fight is on screen.
 */
export function reduceCombat(
  view: CombatView | null,
  event: GameEvent | null,
  display: PublicGameState | null,
): CombatView | null {
  if (!event) return null;
  if (event.type === 'CombatStarted') {
    if (!display) return null;
    return {
      kind: event.kind,
      a: combatant(event.a, display),
      b: combatant(event.b, display),
      first: event.first,
      hits: [],
      winner: null,
      capReached: false,
      eliminated: null,
      pendingIndomitable: false,
    };
  }
  if (!view) return null;
  switch (event.type) {
    case 'PassiveTriggered':
      return event.passive === 'indomitable' ? { ...view, pendingIndomitable: true } : view;
    case 'CombatHit': {
      const badges: HitBadge[] = [];
      if (event.firstStrike) badges.push('firstStrike');
      if (event.rage) badges.push('rage');
      if (event.breath) badges.push('breath');
      if (event.evaded) badges.push('evade');
      if (view.pendingIndomitable) badges.push('indomitable');
      const hit: HitView = {
        index: view.hits.length,
        attacker: event.attacker,
        defender: event.defender,
        roll: event.roll,
        damage: event.damage,
        hpAfter: event.hpAfter,
        badges,
      };
      return {
        ...view,
        a: withHp(view.a, event.defender, event.hpAfter),
        b: withHp(view.b, event.defender, event.hpAfter),
        hits: [...view.hits, hit],
        pendingIndomitable: false,
      };
    }
    case 'CombatEnded':
      return { ...view, winner: event.winner, capReached: event.capReached };
    case 'PlayerEliminated':
      return { ...view, eliminated: event.seat };
    case 'LootTransferred':
      return view;
    default:
      return null;
  }
}
