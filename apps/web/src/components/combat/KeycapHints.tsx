import type { JobId } from '@dragon-rush/engine';
import { keyLabel, type KeyLayout } from '../../types/combatControls';
import { KIT_LABEL } from '../../types/combatLabels';

function Keys({ codes, lit }: { codes: readonly string[]; lit?: ReadonlySet<string> }) {
  return (
    <span className="keycaps">
      {codes.map((c, i) => (
        <span key={c}>
          {i > 0 && <span className="keycap-or">/</span>}
          <kbd className={`keycap${lit?.has(c) ? ' is-lit' : ''}`}>{keyLabel(c)}</kbd>
        </span>
      ))}
    </span>
  );
}

interface KeycapHintsProps {
  layout: KeyLayout;
  /** Shows the job's move names next to the buttons. */
  job?: JobId | null;
  /** Pressed codes (keyboard test). */
  lit?: ReadonlySet<string>;
  compact?: boolean;
}

/** One player's controls as keycaps: move cluster plus attack / skill / dash. */
export function KeycapHints({ layout, job, lit, compact }: KeycapHintsProps) {
  const kit = job ? KIT_LABEL[job] : null;
  const move = [layout.up, layout.left, layout.down, layout.right];
  return (
    <dl className={`keycap-hints${compact ? ' is-compact' : ''}`}>
      <div>
        <dt>이동</dt>
        <dd>
          {move.map((codes, i) => (
            <Keys key={i} codes={codes.slice(0, 1)} lit={lit} />
          ))}
          {layout.up.length > 1 && (
            <span className="keycap-alt">
              또는{' '}
              <Keys
                codes={[layout.up[1]!, layout.left[1]!, layout.down[1]!, layout.right[1]!]}
                lit={lit}
              />
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>공격{kit && <small>{kit.attack}</small>}</dt>
        <dd>
          <Keys codes={layout.attack} lit={lit} />
        </dd>
      </div>
      <div>
        <dt>스킬{kit && <small>{kit.skill}</small>}</dt>
        <dd>
          <Keys codes={layout.skill} lit={lit} />
        </dd>
      </div>
      <div>
        <dt>대시{kit && <small>{kit.dash}</small>}</dt>
        <dd>
          <Keys codes={layout.dash} lit={lit} />
        </dd>
      </div>
    </dl>
  );
}
