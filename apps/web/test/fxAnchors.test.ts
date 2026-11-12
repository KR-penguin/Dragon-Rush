import { describe, expect, it } from 'vitest';
import { createEmberFxResolver } from '../src/services/emberFxResolver';
import { getFxAnchor } from '../src/services/fxAnchors';
import { anchorFromRect, fxAnchorKey, fxAnchorProps } from '../src/types/fxAnchor';

interface FakeEl {
  readonly name: string;
  readonly rect: { left: number; top: number; width: number; height: number };
  readonly children: Record<string, FakeEl>;
  querySelector(sel: string): FakeEl | null;
  getBoundingClientRect(): FakeEl['rect'];
  readonly firstElementChild: FakeEl | null;
}

const el = (name: string, rect: FakeEl['rect'], children: Record<string, FakeEl> = {}): FakeEl => ({
  name,
  rect,
  children,
  querySelector: (sel) => children[sel] ?? null,
  getBoundingClientRect: () => rect,
  firstElementChild: Object.values(children)[0] ?? null,
});

const tileFace = el('tile-face', { left: 102, top: 52, width: 96, height: 46 });
const tile = el('tile', { left: 100, top: 50, width: 100, height: 50 }, { '.tile-face': tileFace });
const pawnCard = el('pawn-card', { left: 10, top: 10, width: 40, height: 60 });
const pawn = el('pawn', { left: 0, top: 0, width: 60, height: 90 }, { '.pawn-card': pawnCard });
const coins = el('coins', { left: 300, top: 20, width: 20, height: 20 });
const card = el('card', { left: 280, top: 0, width: 200, height: 80 });

const root = {
  querySelector: (sel: string) =>
    ({
      '[data-fx-anchor="tile:7"]': tile,
      '[data-fx-anchor="pawn:1"]': pawn,
      '[data-fx-anchor="seat:1"]': card,
      '[data-fx-anchor="seatCoins:1"]': coins,
    })[sel] ?? null,
} as unknown as ParentNode;

describe('fx anchors', () => {
  it('builds stable tags', () => {
    expect(fxAnchorKey({ kind: 'seat', id: 2 })).toBe('seat:2');
    expect(fxAnchorKey({ kind: 'lair' })).toBe('lair');
    expect(fxAnchorProps({ kind: 'tile', id: 3 })).toEqual({ 'data-fx-anchor': 'tile:3' });
    expect(anchorFromRect({ left: 10, top: 20, width: 30, height: 40 })).toEqual({
      x: 25,
      y: 40,
      width: 30,
      height: 40,
    });
  });

  it('resolves a tagged tile or seat card to its screen centre', () => {
    expect(getFxAnchor({ kind: 'tile', id: 7 }, root)).toEqual({ x: 150, y: 75, width: 100, height: 50 });
    expect(getFxAnchor({ kind: 'seat', id: 1 }, root)).toMatchObject({ x: 380, y: 40 });
    expect(getFxAnchor({ kind: 'tile', id: 99 }, root)).toBeNull();
    expect(getFxAnchor({ kind: 'tile', id: 7 }, null)).toBeNull();
  });
});

describe('ember FX resolver', () => {
  const resolve = createEmberFxResolver(root);

  it('punches the tile face leaf, never the 3D tile itself', () => {
    const p = resolve({ kind: 'tile', tile: 7 })!;
    expect(p).toMatchObject({ x: 150, y: 75 });
    expect((p.el as unknown as FakeEl).name).toBe('tile-face');
  });

  it('maps seats to pawns and HUD slots to the corner card parts', () => {
    const seat = resolve({ kind: 'seat', seat: 1 })!;
    expect((seat.el as unknown as FakeEl).name).toBe('pawn-card');
    expect(seat.textDy).toBeLessThan(0);
    expect(resolve({ kind: 'hud', seat: 1, slot: 'coins' })).toMatchObject({ x: 310, y: 30 });
    expect(resolve({ kind: 'hud', seat: 1, slot: 'panel' })).toMatchObject({ x: 380, y: 40 });
    expect(resolve({ kind: 'point', x: 4, y: 5 })).toEqual({ x: 4, y: 5 });
    expect(resolve({ kind: 'screen', at: 'center' })).toBeNull();
    expect(resolve({ kind: 'seat', seat: 3 })).toBeNull();
  });
});
