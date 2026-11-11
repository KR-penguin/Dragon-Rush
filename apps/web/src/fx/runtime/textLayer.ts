import { TEXT_KINDS, textFrame, type FloatingTextItem } from '../core/floatingText';
import type { PresetSpace } from '../core/particlePresets';

/** DOM renderer for floating texts on the screen overlay: one absolutely placed span per item. */
export function createTextLayer(container: HTMLElement) {
  const nodes = new Map<number, HTMLSpanElement>();
  return {
    render(
      items: readonly FloatingTextItem[],
      now: number,
      inPlace: boolean,
      unit: (space: PresetSpace) => number,
    ): void {
      const seen = new Set<number>();
      for (const it of items) {
        seen.add(it.id);
        const spec = TEXT_KINDS[it.kind];
        const u = unit(spec.space);
        let el = nodes.get(it.id);
        if (!el) {
          el = document.createElement('span');
          el.className = `fx-text fx-text--${it.kind}`;
          el.style.color = spec.color;
          el.style.fontSize = `${Math.round(spec.fontPx * u)}px`;
          container.appendChild(el);
          nodes.set(it.id, el);
        }
        if (el.textContent !== it.text) el.textContent = it.text;
        const f = textFrame(spec, now - it.born, now - it.popAt, inPlace);
        el.style.transform = `translate3d(${(it.x + f.dx * u).toFixed(1)}px, ${(it.y + f.dy * u).toFixed(1)}px, 0) translate(-50%, -50%) scale(${f.scale.toFixed(3)})`;
        el.style.opacity = f.alpha.toFixed(3);
      }
      for (const [id, el] of nodes) {
        if (!seen.has(id)) {
          el.remove();
          nodes.delete(id);
        }
      }
    },
    clear(): void {
      for (const el of nodes.values()) el.remove();
      nodes.clear();
    },
  };
}
