import { createCombat, type CombatState } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { KeyTracker, createKeyboardSource } from '../src/services/fight/keyboardInput';
import { TouchTracker } from '../src/services/fight/touchInput';
import { KEY_LAYOUTS } from '../src/types/combatControls';

const state: CombatState = createCombat(
  {
    kind: 'duel',
    a: { job: 'swordsman', hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: true },
    b: { job: 'ninja', hp: 30, maxHp: 30, atk: 4, def: 5, indomitableAvailable: false },
  },
  42,
);

describe('touch fight input', () => {
  it('combines two movement fingers and simultaneous action buttons', () => {
    const touch = new TouchTracker();
    touch.press(1, 'up');
    touch.press(2, 'right');
    touch.press(3, 'attack');
    touch.press(4, 'skill');
    touch.press(5, 'dash');
    expect(touch.sample()).toEqual({ move: 2, attack: true, skill: true, dash: true });
    touch.release(2);
    touch.release(4);
    expect(touch.sample()).toEqual({ move: 1, attack: true, skill: false, dash: true });
  });

  it('keeps a sub-tick action tap for one sample and discards canceled pointers', () => {
    const touch = new TouchTracker();
    touch.press(1, 'attack');
    touch.release(1);
    expect(touch.sample().attack).toBe(true);
    expect(touch.sample().attack).toBe(false);
    touch.press(2, 'skill');
    touch.cancel(2);
    expect(touch.sample().skill).toBe(false);
    touch.press(3, 'dash');
    touch.releaseAll();
    expect(touch.sample().dash).toBe(false);
  });

  it('keeps another finger held when one pointer is canceled', () => {
    const touch = new TouchTracker();
    touch.press(1, 'attack');
    touch.press(2, 'attack');
    touch.cancel(1);
    expect(touch.sample().attack).toBe(true);
    touch.cancel(2);
    expect(touch.sample().attack).toBe(false);
  });

  it('merges with keyboard for P1 and solo but leaves hot-seat P2 untouched', () => {
    const tracker = new KeyTracker();
    const p1 = createKeyboardSource(tracker, KEY_LAYOUTS.p1);
    const p2 = createKeyboardSource(tracker, KEY_LAYOUTS.p2);
    tracker.touch.press(1, 'left');
    tracker.touch.press(2, 'attack');
    expect(p1.sample(state, 'a')).toEqual({ move: 7, attack: true, skill: false, dash: false });
    expect(p2.sample(state, 'b')).toEqual({ move: 0, attack: false, skill: false, dash: false });
  });

  it('clears held and queued touch input on blur, hidden tab, and detach', () => {
    const winListeners = new Map<string, (event: Event) => void>();
    const docListeners = new Map<string, (event: Event) => void>();
    const target = (listeners: Map<string, (event: Event) => void>) => ({
      addEventListener: (type: string, fn: (event: Event) => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    const doc = { ...target(docListeners), hidden: false };
    const tracker = new KeyTracker();
    const source = createKeyboardSource(tracker, KEY_LAYOUTS.solo);
    const detach = tracker.attach(target(winListeners), doc);
    tracker.touch.press(1, 'attack');
    winListeners.get('blur')!({} as Event);
    expect(source.sample(state, 'a').attack).toBe(false);
    tracker.touch.press(2, 'skill');
    tracker.touch.release(2);
    doc.hidden = true;
    docListeners.get('visibilitychange')!({} as Event);
    expect(source.sample(state, 'a').skill).toBe(false);
    tracker.touch.press(3, 'dash');
    detach();
    expect(source.sample(state, 'a').dash).toBe(false);
  });
});
