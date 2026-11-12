/**
 * Named screen anchors for effects (coin fly-to, floating numbers, particles). Views tag their
 * elements with `data-fx-anchor`; `services/fxAnchors.getFxAnchor` turns a tag into screen pixels.
 */
export type FxAnchorKind =
  | 'seat' // corner player card
  | 'seatHp' // HP bar on the corner card
  | 'seatCoins' // coin counter on the corner card
  | 'tile' // board tile plaque (3D, projected)
  | 'pawn' // pawn standee
  | 'lair' // dragon on the lair
  | 'dice'; // roulette tray; key retained for the existing FX anchor contract

export interface FxAnchor {
  readonly kind: FxAnchorKind;
  /** Seat or tile index; omitted for singletons (lair, dice). */
  readonly id?: number;
}

export const FX_ANCHOR_ATTR = 'data-fx-anchor';

export const fxAnchorKey = (a: FxAnchor): string =>
  a.id === undefined ? a.kind : `${a.kind}:${a.id}`;

/** Spread onto an element: `<div {...fxAnchorProps({ kind: 'seat', id: 0 })}>`. */
export const fxAnchorProps = (a: FxAnchor): Record<typeof FX_ANCHOR_ATTR, string> => ({
  [FX_ANCHOR_ATTR]: fxAnchorKey(a),
});

/** Wrapper the FX toolkit's trauma shake drives; the HUD lives outside it and never shakes. */
export const WORLD_SHAKE_SELECTOR = '.world-shake';

export interface ScreenAnchor {
  /** Centre in viewport CSS px. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Centre of a client rect as a screen anchor (pure, so it can be tested without a DOM). */
export const anchorFromRect = (r: {
  left: number;
  top: number;
  width: number;
  height: number;
}): ScreenAnchor => ({
  x: r.left + r.width / 2,
  y: r.top + r.height / 2,
  width: r.width,
  height: r.height,
});
