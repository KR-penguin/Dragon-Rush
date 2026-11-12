import type { PublicGameState } from '@dragon-rush/engine';
import { RING_SIDE, ringCell, ringSize, slotOffset, tokenSlots } from '../../types/boardLayout';
import type { FxAnchor, FxPoint, FxResolver } from '../types';

/**
 * Selectors of the current (pre-redesign) board markup. A redesigned board passes its own
 * selectors, or replaces this resolver entirely — effects only depend on `FxResolver`.
 */
export const BOARD_SELECTORS = {
  board: '.board',
  tiles: '.board-grid > .tile',
  panels: '.game-players > .player-panel',
  coins: '.pp-coins',
  hp: '.hp-bar',
  stats: '.pp-stats',
  dice: '.dice',
  dragon: '.lair-dragon',
  combat: '.combat-overlay',
  fighterA: '.fighter-left .fighter-portrait',
  fighterB: '.fighter-right .fighter-portrait',
} as const;

export type BoardSelectors = { readonly [K in keyof typeof BOARD_SELECTORS]: string };

export interface BoardResolverOptions {
  /** The state the board currently shows (the store's `display`). */
  readonly getDisplay: () => PublicGameState | null;
  readonly root?: ParentNode;
  readonly selectors?: Partial<BoardSelectors>;
}

function center(el: Element | null | undefined, textDy?: number): FxPoint | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    el,
    textDy: textDy ?? -r.height * 0.6,
  };
}

/** Resolver for the DOM ring board: tiles from ring geometry, seats from the shown positions. */
export function createBoardFxResolver(o: BoardResolverOptions): FxResolver {
  const sel: BoardSelectors = { ...BOARD_SELECTORS, ...o.selectors };
  const root = (): ParentNode | null =>
    o.root ?? (typeof document !== 'undefined' ? document : null);
  const q = (s: string): Element | null => root()?.querySelector(s) ?? null;

  const boardRect = (): DOMRect | null => {
    const r = q(sel.board)?.getBoundingClientRect();
    return r && r.width > 0 ? r : null;
  };

  const cellPoint = (tile: number, dx = 0, dy = 0): FxPoint | null => {
    const rect = boardRect();
    if (!rect || !Number.isInteger(tile) || tile < 0 || tile >= ringSize()) return null;
    const cell = ringCell(tile);
    const size = rect.width / RING_SIDE;
    return {
      x: rect.left + (cell.col + 0.5 + dx) * size,
      y: rect.top + (cell.row + 0.5 + dy) * size,
      textDy: -size * 0.55,
    };
  };

  const seatPoint = (seat: number): FxPoint | null => {
    const display = o.getDisplay();
    const p = display?.players.find((x) => x.seat === seat);
    if (!display || !p) return null;
    const slots = tokenSlots(
      display.players
        .filter((x) => x.alive || x.seat === seat)
        .map((x) => ({ seat: x.seat, tile: x.position })),
    );
    const slot = slots.get(seat);
    const off = slot ? slotOffset(slot.slot, slot.count) : { dx: 0, dy: 0 };
    return cellPoint(p.position, off.dx, off.dy);
  };

  const fighter = (side: 'a' | 'b'): FxPoint | null => {
    const overlay = q(sel.combat);
    const portrait = overlay?.querySelector(side === 'a' ? sel.fighterA : sel.fighterB);
    const p = center(portrait);
    // Punch the art inside the portrait so its own CSS hit-shake keeps running.
    return p && portrait ? { ...p, el: portrait.firstElementChild ?? portrait } : p;
  };

  return (a: FxAnchor): FxPoint | null => {
    switch (a.kind) {
      case 'point':
        return { x: a.x, y: a.y };
      case 'screen':
        return null;
      case 'tile': {
        const p = cellPoint(a.tile);
        const el = root()?.querySelectorAll(sel.tiles)[a.tile];
        return p && el ? { ...p, el } : p;
      }
      case 'seat':
        return seatPoint(a.seat);
      case 'hud': {
        const display = o.getDisplay();
        const index = display?.players.findIndex((p) => p.seat === a.seat) ?? -1;
        const panel = index >= 0 ? root()?.querySelectorAll(sel.panels)[index] : undefined;
        if (!panel) return seatPoint(a.seat);
        const part = a.slot === 'panel' ? panel : panel.querySelector(sel[a.slot]);
        return center(part ?? panel, 0);
      }
      case 'combatant': {
        if (q(sel.combat) && a.side) {
          const p = fighter(a.side);
          if (p) return p;
        }
        if (a.ref === 'dragon') return center(q(sel.dragon)) ?? center(q(sel.board));
        return seatPoint(a.ref);
      }
      case 'board':
        return center(q(sel.board), 0);
      case 'dice':
        return center(q(sel.dice)) ?? center(q(sel.board), 0);
    }
  };
}
