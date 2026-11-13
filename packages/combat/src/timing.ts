import type { MoveSpec } from './rules';

/** Total live ticks of a move; a bow draw lasts until its button is released. */
export function moveTotal(spec: MoveSpec): number {
  switch (spec.type) {
    case 'melee':
    case 'parry':
      return spec.startup + spec.active + spec.recovery;
    case 'shot':
      return spec.startup + 1 + spec.recovery;
    case 'rune':
      return spec.startup + spec.holdTicks + 1 + spec.recovery;
    case 'draw':
      return Number.POSITIVE_INFINITY;
  }
}
