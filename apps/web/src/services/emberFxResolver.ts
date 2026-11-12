import type { FxAnchor as FxCueAnchor, FxPoint, FxResolver } from '../fx';
import { FX_ANCHOR_ATTR, fxAnchorKey, type FxAnchor } from '../types/fxAnchor';

type Root = Pick<ParentNode, 'querySelector'>;

/** Selectors the resolver needs besides `data-fx-anchor` tags (combat overlay, board area). */
export const EMBER_FX_SELECTORS = {
  boardArea: '.board-area',
  combat: '.combat-overlay',
  fighterA: '.fighter-left .fighter-portrait',
  fighterB: '.fighter-right .fighter-portrait',
  hudStats: '.cc-row',
  /** Leaf parts that may be punched without flattening the 3D board. */
  tileFace: '.tile-face',
  pawnCard: '.pawn-card',
} as const;

function point(
  el: Element | null | undefined,
  textDy?: number,
  punch?: Element | null,
): FxPoint | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    el: punch ?? el,
    textDy: textDy ?? -r.height * 0.6,
  };
}

/**
 * FX resolver for the Ember Table board: seats are pawns, `hud` slots are the corner cards, tiles
 * are the projected plaques. Punches target leaf elements (tile face, pawn card) because a WAAPI
 * opacity or scale on a preserve-3d ancestor would flatten the board.
 */
export function createEmberFxResolver(
  root: Root | null = typeof document === 'undefined' ? null : document,
): FxResolver {
  const tagged = (a: FxAnchor): Element | null =>
    root?.querySelector(`[${FX_ANCHOR_ATTR}="${fxAnchorKey(a)}"]`) ?? null;
  const q = (s: string): Element | null => root?.querySelector(s) ?? null;

  const pawn = (seat: number): FxPoint | null => {
    const el = tagged({ kind: 'pawn', id: seat });
    if (!el) return null;
    const card = el.querySelector(EMBER_FX_SELECTORS.pawnCard);
    const p = point(card ?? el, undefined, card);
    return p ? { ...p, textDy: -(card?.getBoundingClientRect().height ?? 60) * 0.8 } : null;
  };

  return (a: FxCueAnchor): FxPoint | null => {
    switch (a.kind) {
      case 'point':
        return { x: a.x, y: a.y };
      case 'screen':
        return null;
      case 'tile': {
        const el = tagged({ kind: 'tile', id: a.tile });
        return point(el, undefined, el?.querySelector(EMBER_FX_SELECTORS.tileFace));
      }
      case 'seat':
        return pawn(a.seat) ?? point(tagged({ kind: 'seat', id: a.seat }), 0);
      case 'hud': {
        const card = tagged({ kind: 'seat', id: a.seat });
        if (!card) return pawn(a.seat);
        const part =
          a.slot === 'coins'
            ? tagged({ kind: 'seatCoins', id: a.seat })
            : a.slot === 'hp'
              ? tagged({ kind: 'seatHp', id: a.seat })
              : a.slot === 'stats'
                ? card.querySelector(EMBER_FX_SELECTORS.hudStats)
                : card;
        return point(part ?? card, 0);
      }
      case 'combatant': {
        const overlay = q(EMBER_FX_SELECTORS.combat);
        if (overlay && a.side) {
          const portrait = overlay.querySelector(
            a.side === 'a' ? EMBER_FX_SELECTORS.fighterA : EMBER_FX_SELECTORS.fighterB,
          );
          // Punch the art inside the portrait so its own CSS hit-shake keeps running.
          const p = point(portrait, undefined, portrait?.firstElementChild ?? portrait);
          if (p) return p;
        }
        if (a.ref === 'dragon')
          return point(tagged({ kind: 'lair' })) ?? point(q(EMBER_FX_SELECTORS.boardArea), 0);
        return pawn(a.ref);
      }
      case 'board':
        return point(q(EMBER_FX_SELECTORS.boardArea), 0);
      case 'dice':
        return point(tagged({ kind: 'dice' })) ?? point(q(EMBER_FX_SELECTORS.boardArea), 0);
    }
  };
}
