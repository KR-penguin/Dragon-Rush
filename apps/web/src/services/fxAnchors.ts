import {
  anchorFromRect,
  FX_ANCHOR_ATTR,
  fxAnchorKey,
  type FxAnchor,
  type ScreenAnchor,
} from '../types/fxAnchor';

/**
 * Screen position of a tagged element, e.g. `getFxAnchor({ kind: 'seat', id: 2 })` for a corner
 * card or `{ kind: 'tile', id: 7 }` for a board tile (its projected 3D bounds). Null when absent.
 */
export function getFxAnchor(
  anchor: FxAnchor,
  root: Pick<ParentNode, 'querySelector'> | null = typeof document === 'undefined'
    ? null
    : document,
): ScreenAnchor | null {
  const el = root?.querySelector(`[${FX_ANCHOR_ATTR}="${fxAnchorKey(anchor)}"]`);
  if (!el) return null;
  return anchorFromRect(el.getBoundingClientRect());
}
