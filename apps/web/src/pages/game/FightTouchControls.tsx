import type { Side } from '@dragon-rush/combat';
import { useLayoutEffect } from 'react';
import { TouchControls } from '../../components/combat/TouchControls';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTouchCooldowns } from '../../hooks/useTouchCooldowns';
import type { FightSession } from '../../services/fight';
import type { TouchTracker } from '../../services/fight/touchInput';

const TOUCH_QUERY = '(any-pointer: coarse), (max-width: 820px)';

/** Only the visible touch pad subscribes to cooldown frames; the canvas and portraits stay independent. */
export function FightTouchControls({
  session,
  side,
  tracker,
  onPause,
}: {
  session: FightSession | null;
  side: Side;
  tracker: TouchTracker;
  onPause: () => void;
}) {
  const visible = useMediaQuery(TOUCH_QUERY);
  const cooldowns = useTouchCooldowns(visible ? session : null, visible ? side : null);
  useLayoutEffect(() => {
    if (!visible) tracker.releaseAll();
  }, [tracker, visible]);
  return visible ? (
    <TouchControls tracker={tracker} cooldowns={cooldowns} onPause={onPause} />
  ) : null;
}
