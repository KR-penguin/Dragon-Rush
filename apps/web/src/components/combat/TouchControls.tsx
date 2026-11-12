import type { PointerEvent } from 'react';
import type { TouchAction, TouchTracker } from '../../services/fight/touchInput';
import type { TouchCooldown, TouchCooldowns } from '../../hooks/useTouchCooldowns';

const directions: readonly { action: TouchAction; glyph: string; label: string }[] = [
  { action: 'up', glyph: '↑', label: '위로 이동' },
  { action: 'left', glyph: '←', label: '왼쪽으로 이동' },
  { action: 'right', glyph: '→', label: '오른쪽으로 이동' },
  { action: 'down', glyph: '↓', label: '아래로 이동' },
];
const attacks: readonly { action: TouchAction; label: string }[] = [
  { action: 'attack', label: '공격' },
  { action: 'skill', label: '스킬' },
  { action: 'dash', label: '대시' },
];
const accessiblePointers: Readonly<Record<TouchAction, number>> = {
  up: -1,
  down: -2,
  left: -3,
  right: -4,
  attack: -5,
  skill: -6,
  dash: -7,
};

function TouchButton({
  action,
  label,
  children,
  tracker,
  cooldown,
}: {
  action: TouchAction;
  label: string;
  children: string;
  tracker: TouchTracker;
  cooldown?: TouchCooldown | null;
}) {
  const seconds =
    cooldown && cooldown.charges < cooldown.maxCharges ? (cooldown.tenths / 10).toFixed(1) : null;
  const accessibleLabel = cooldown
    ? `${label}, ${cooldown.charges}/${cooldown.maxCharges}회${seconds ? `, 다음 충전 ${seconds}초` : ''}`
    : label;
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (tracker.press(event.pointerId, action))
      event.currentTarget.setPointerCapture(event.pointerId);
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    tracker.release(event.pointerId);
  };
  const cancel = (event: PointerEvent<HTMLButtonElement>) => {
    tracker.cancel(event.pointerId);
  };
  return (
    <button
      type="button"
      className={`combat-touch-button is-${action}`}
      aria-label={accessibleLabel}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onClick={(event) => {
        if (event.detail !== 0) return;
        const id = accessiblePointers[action];
        tracker.press(id, action);
        tracker.release(id);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="combat-touch-name">
        {children}
        {cooldown && cooldown.maxCharges > 1 && (
          <span className="combat-touch-charges" aria-hidden="true">
            {cooldown.charges}/{cooldown.maxCharges}
          </span>
        )}
      </span>
      {seconds && (
        <span className="combat-touch-cooldown" aria-hidden="true">
          {seconds}초
        </span>
      )}
    </button>
  );
}

/** One local fighter uses the touch pad; keyboard and gamepad stay active. */
export function TouchControls({
  tracker,
  onPause,
  cooldowns,
}: {
  tracker: TouchTracker;
  onPause: () => void;
  cooldowns: TouchCooldowns | null;
}) {
  return (
    <div className="combat-touch-controls" aria-label="터치 전투 조작">
      <div className="combat-touch-pad" role="group" aria-label="이동">
        {directions.map((item) => (
          <TouchButton key={item.action} {...item} tracker={tracker}>
            {item.glyph}
          </TouchButton>
        ))}
      </div>
      <div className="combat-touch-actions" role="group" aria-label="전투 행동">
        {attacks.map((item) => (
          <TouchButton
            key={item.action}
            {...item}
            tracker={tracker}
            cooldown={
              item.action === 'skill'
                ? cooldowns?.skill
                : item.action === 'dash'
                  ? cooldowns?.dash
                  : null
            }
          >
            {item.label}
          </TouchButton>
        ))}
      </div>
      <button
        type="button"
        className="combat-touch-pause"
        onClick={onPause}
        aria-label="전투 일시 정지"
      >
        Ⅱ
      </button>
    </div>
  );
}
