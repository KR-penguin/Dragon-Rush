import type { CombatState, Side } from '@dragon-rush/combat';
import { useEffect, useState } from 'react';
import { dashCooldown, skillCooldown, type CooldownView } from '../combat/render/hudModel';
import type { FightSide } from '../services/gameClient';
import type { FightSession } from '../services/fight';

export interface TouchCooldown {
  readonly charges: number;
  readonly maxCharges: number;
  readonly tenths: number;
}

export interface TouchCooldowns {
  readonly skill: TouchCooldown;
  readonly dash: TouchCooldown;
}

export function touchControlSide(sides: readonly FightSide[]): Side | null {
  return (
    sides.find((side) => side.control === 'keyboard-p1' || side.control === 'keyboard-solo')
      ?.side ?? null
  );
}

export function readTouchCooldowns(state: CombatState, side: Side): TouchCooldowns | null {
  const fighter = state[side];
  if (!fighter) return null;
  const cooldown = (view: CooldownView): TouchCooldown => ({
    charges: view.charges,
    maxCharges: view.maxCharges,
    tenths: Math.round(view.seconds * 10),
  });
  return {
    skill: cooldown(skillCooldown(state, fighter)),
    dash: cooldown(dashCooldown(state, fighter)),
  };
}

function sameCooldowns(a: TouchCooldowns, b: TouchCooldowns): boolean {
  return (
    a.skill.charges === b.skill.charges &&
    a.skill.maxCharges === b.skill.maxCharges &&
    a.skill.tenths === b.skill.tenths &&
    a.dash.charges === b.dash.charges &&
    a.dash.maxCharges === b.dash.maxCharges &&
    a.dash.tenths === b.dash.tenths
  );
}

export function useTouchCooldowns(
  session: FightSession | null,
  side: Side | null,
): TouchCooldowns | null {
  const [snapshot, setSnapshot] = useState<{
    session: FightSession;
    side: Side;
    cooldowns: TouchCooldowns;
  } | null>(null);

  useEffect(() => {
    if (!session || !side) return;
    const update = (state: CombatState) => {
      const cooldowns = readTouchCooldowns(state, side);
      if (!cooldowns) return;
      setSnapshot((previous) =>
        previous?.session === session &&
        previous.side === side &&
        sameCooldowns(previous.cooldowns, cooldowns)
          ? previous
          : { session, side, cooldowns },
      );
    };
    update(session.frame().curr);
    return session.onFrame((frame) => update(frame.curr));
  }, [session, side]);

  return snapshot?.session === session && snapshot.side === side ? snapshot.cooldowns : null;
}
