import { NO_INPUT, createCombat, type CombatState, type FighterInput } from '@dragon-rush/combat';
import { describe, expect, it, vi } from 'vitest';
import {
  combineSources,
  createGamepadSource,
  readPad,
  type PadLike,
} from '../src/services/fight/gamepadInput';
import { KeyTracker, createKeyboardSource, gameKeysOf } from '../src/services/fight/keyboardInput';
import {
  KEY_LAYOUTS,
  dirFromAxes,
  inputFromKeys,
  inputFromPad,
  keyLabel,
  layoutCodes,
  mergeInputs,
  packInput,
  quantizeStick,
  unpackInput,
} from '../src/types/combatControls';

const STATE: CombatState = createCombat(
  {
    kind: 'duel',
    a: { job: 'swordsman', hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: true },
    b: { job: 'ninja', hp: 30, maxHp: 30, atk: 4, def: 5, indomitableAvailable: false },
  },
  1,
);

const down = (code: string, extra: Partial<{ repeat: boolean; ctrlKey: boolean }> = {}) => {
  const preventDefault = vi.fn();
  return { code, preventDefault, ...extra };
};

describe('direction mapping', () => {
  it('maps the 3×3 key grid to 0..8 and cancels opposite keys', () => {
    expect(dirFromAxes(false, false, false, false)).toBe(0);
    expect(dirFromAxes(true, false, false, false)).toBe(1); // N
    expect(dirFromAxes(true, false, false, true)).toBe(2); // NE
    expect(dirFromAxes(false, false, false, true)).toBe(3); // E
    expect(dirFromAxes(false, true, false, true)).toBe(4); // SE
    expect(dirFromAxes(false, true, false, false)).toBe(5); // S
    expect(dirFromAxes(false, true, true, false)).toBe(6); // SW
    expect(dirFromAxes(false, false, true, false)).toBe(7); // W
    expect(dirFromAxes(true, false, true, false)).toBe(8); // NW
    expect(dirFromAxes(true, true, false, false)).toBe(0);
    expect(dirFromAxes(false, false, true, true)).toBe(0);
    expect(dirFromAxes(true, true, true, false)).toBe(7);
  });

  it('quantises the stick to 8 ways with a 0.35 dead zone', () => {
    expect(quantizeStick(0.2, 0.2)).toBe(0);
    expect(quantizeStick(0, -1)).toBe(1);
    expect(quantizeStick(0.7, -0.7)).toBe(2);
    expect(quantizeStick(1, 0)).toBe(3);
    expect(quantizeStick(0.7, 0.7)).toBe(4);
    expect(quantizeStick(0, 1)).toBe(5);
    expect(quantizeStick(-0.7, 0.7)).toBe(6);
    expect(quantizeStick(-1, 0)).toBe(7);
    expect(quantizeStick(-0.7, -0.7)).toBe(8);
    expect(quantizeStick(0.9, 0.3)).toBe(3); // 18° stays east
    expect(quantizeStick(Number.NaN, 1)).toBe(0);
  });

  it('reads the standard gamepad: D-pad over stick, South/West/East(RB)', () => {
    const pressed = (...i: number[]) => Array.from({ length: 16 }, (_, k) => i.includes(k));
    expect(inputFromPad({ axes: [1, 0], pressed: pressed(0) })).toEqual({
      move: 3,
      attack: true,
      skill: false,
      dash: false,
    });
    expect(inputFromPad({ axes: [1, 0], pressed: pressed(12, 2) })).toEqual({
      move: 1,
      attack: false,
      skill: true,
      dash: false,
    });
    expect(inputFromPad({ axes: [], pressed: pressed(5) }).dash).toBe(true);
    expect(inputFromPad({ axes: [], pressed: pressed(1) }).dash).toBe(true);
  });

  it('picks pads by connection order for hot-seat and merges them for solo', () => {
    const pad = (index: number, buttons: number[], axes: number[] = [0, 0]): PadLike => ({
      index,
      connected: true,
      axes,
      buttons: Array.from({ length: 16 }, (_, k) => ({ pressed: buttons.includes(k) })),
    });
    const pads = () => [null, pad(1, [0]), pad(2, [2], [-1, 0])];
    expect(readPad(pads, 0)).toEqual({ move: 0, attack: true, skill: false, dash: false });
    expect(readPad(pads, 1)).toEqual({ move: 7, attack: false, skill: true, dash: false });
    expect(readPad(pads, 5)).toBe(NO_INPUT);
    expect(readPad(pads, 'any')).toEqual({ move: 7, attack: true, skill: true, dash: false });
    expect(createGamepadSource(0, () => []).sample(STATE, 'a')).toBe(NO_INPUT);
  });
});

describe('key layouts', () => {
  const held =
    (...codes: string[]) =>
    (c: string) =>
      codes.includes(c);

  it('P1 (arriver) is WASD + F/G/H', () => {
    expect(inputFromKeys(KEY_LAYOUTS.p1, held('KeyW', 'KeyD', 'KeyF'))).toEqual({
      move: 2,
      attack: true,
      skill: false,
      dash: false,
    });
    expect(inputFromKeys(KEY_LAYOUTS.p1, held('KeyG', 'KeyH'))).toEqual({
      move: 0,
      attack: false,
      skill: true,
      dash: true,
    });
    // Arrows and the solo keys are not P1's
    expect(inputFromKeys(KEY_LAYOUTS.p1, held('ArrowUp', 'KeyJ'))).toEqual(NO_INPUT);
  });

  it('P2 (defender) is arrows + Numpad1/2/3 with the laptop , . / row', () => {
    expect(inputFromKeys(KEY_LAYOUTS.p2, held('ArrowLeft', 'Numpad1'))).toEqual({
      move: 7,
      attack: true,
      skill: false,
      dash: false,
    });
    expect(inputFromKeys(KEY_LAYOUTS.p2, held('Comma', 'Period', 'Slash'))).toEqual({
      move: 0,
      attack: true,
      skill: true,
      dash: true,
    });
    expect(inputFromKeys(KEY_LAYOUTS.p2, held('KeyW', 'KeyF'))).toEqual(NO_INPUT);
  });

  it('solo accepts WASD or arrows and J/Z, K/X, L/C/Space', () => {
    expect(inputFromKeys(KEY_LAYOUTS.solo, held('ArrowDown', 'KeyZ'))).toEqual({
      move: 5,
      attack: true,
      skill: false,
      dash: false,
    });
    expect(inputFromKeys(KEY_LAYOUTS.solo, held('KeyA', 'KeyK', 'Space'))).toEqual({
      move: 7,
      attack: false,
      skill: true,
      dash: true,
    });
  });

  it('never uses modifier keys or Tab, and P1/P2 share no key', () => {
    const all = Object.values(KEY_LAYOUTS).flatMap(layoutCodes);
    for (const code of all) expect(code).not.toMatch(/Shift|Control|Alt|Meta|Tab/);
    const p1 = new Set(layoutCodes(KEY_LAYOUTS.p1));
    expect(layoutCodes(KEY_LAYOUTS.p2).some((c) => p1.has(c))).toBe(false);
  });

  it('labels keycaps', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Numpad1')).toBe('Num1');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Slash')).toBe('/');
  });
});

describe('keyboard tracking', () => {
  it('prevents the browser default on game keys only, and not with Ctrl/Alt/Meta', () => {
    const t = new KeyTracker(gameKeysOf([KEY_LAYOUTS.solo]));
    const space = down('Space');
    t.keyDown(space);
    expect(space.preventDefault).toHaveBeenCalled();
    const q = down('KeyQ');
    t.keyDown(q);
    expect(q.preventDefault).not.toHaveBeenCalled();
    const ctrlW = down('KeyW', { ctrlKey: true });
    t.keyDown(ctrlW);
    expect(ctrlW.preventDefault).not.toHaveBeenCalled();
    expect(t.isDown('KeyW')).toBe(true);
  });

  it('reads levels every tick and turns a sub-tick tap into a one-tick press', () => {
    const t = new KeyTracker();
    const src = createKeyboardSource(t, KEY_LAYOUTS.solo);
    t.keyDown(down('KeyJ'));
    expect(src.sample(STATE, 'a').attack).toBe(true);
    expect(src.sample(STATE, 'a').attack).toBe(true); // held = level
    t.keyUp(down('KeyJ'));
    expect(src.sample(STATE, 'a').attack).toBe(false);
    // tap between two ticks: down + up before the next sample
    t.keyDown(down('KeyK'));
    t.keyUp(down('KeyK'));
    expect(src.sample(STATE, 'a').skill).toBe(true);
    expect(src.sample(STATE, 'a').skill).toBe(false);
  });

  it('ignores key repeat and presses made before the source existed', () => {
    const t = new KeyTracker();
    t.keyDown(down('KeyJ'));
    t.keyUp(down('KeyJ'));
    const src = createKeyboardSource(t, KEY_LAYOUTS.solo);
    expect(src.sample(STATE, 'a')).toEqual(NO_INPUT);
    t.keyDown(down('KeyJ'));
    expect(src.sample(STATE, 'a').attack).toBe(true);
    t.keyDown(down('KeyJ', { repeat: true }));
    expect(t.pressCount('KeyJ')).toBe(2);
  });

  it('keeps hot-seat players apart on one shared keyboard', () => {
    const t = new KeyTracker(gameKeysOf([KEY_LAYOUTS.p1, KEY_LAYOUTS.p2]));
    const p1 = createKeyboardSource(t, KEY_LAYOUTS.p1);
    const p2 = createKeyboardSource(t, KEY_LAYOUTS.p2);
    for (const code of ['KeyD', 'KeyF', 'ArrowLeft', 'Numpad3']) t.keyDown(down(code));
    expect(p1.sample(STATE, 'a')).toEqual({ move: 3, attack: true, skill: false, dash: false });
    expect(p2.sample(STATE, 'b')).toEqual({ move: 7, attack: false, skill: false, dash: true });
    // a P2 tap must not be swallowed by P1's sample
    t.keyDown(down('Comma'));
    t.keyUp(down('Comma'));
    p1.sample(STATE, 'a');
    expect(p2.sample(STATE, 'b').attack).toBe(true);
  });

  it('releases everything on window blur and when the tab hides', () => {
    const listeners = new Map<string, (e: Event) => void>();
    const target = {
      addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const doc = { ...target, hidden: false };
    const t = new KeyTracker();
    const detach = t.attach(target, doc);
    listeners.get('keydown')!({ code: 'KeyW' } as unknown as Event);
    expect(t.isDown('KeyW')).toBe(true);
    listeners.get('blur')!({} as Event);
    expect(t.isDown('KeyW')).toBe(false);
    listeners.get('keydown')!({ code: 'KeyA' } as unknown as Event);
    doc.hidden = true;
    listeners.get('visibilitychange')!({} as Event);
    expect(t.isDown('KeyA')).toBe(false);
    detach();
    expect(listeners.size).toBe(0);
  });
});

describe('input packing and merging', () => {
  it('round-trips every input through one byte', () => {
    for (let move = 0; move <= 8; move++) {
      for (let bits = 0; bits < 8; bits++) {
        const i: FighterInput = {
          move: move as FighterInput['move'],
          attack: (bits & 1) !== 0,
          skill: (bits & 2) !== 0,
          dash: (bits & 4) !== 0,
        };
        const b = packInput(i);
        expect(b).toBeLessThan(128);
        expect(unpackInput(b)).toEqual(i);
      }
    }
  });

  it('merges keyboard and pad: first direction wins, buttons OR', () => {
    expect(mergeInputs([NO_INPUT, NO_INPUT])).toBe(NO_INPUT);
    expect(
      mergeInputs([
        { move: 0, attack: true, skill: false, dash: false },
        { move: 5, attack: false, skill: false, dash: true },
      ]),
    ).toEqual({ move: 5, attack: true, skill: false, dash: true });
    const combined = combineSources([
      { sample: () => ({ move: 1, attack: false, skill: false, dash: false }) },
      { sample: () => ({ move: 5, attack: false, skill: true, dash: false }) },
    ]);
    expect(combined.sample(STATE, 'a')).toEqual({
      move: 1,
      attack: false,
      skill: true,
      dash: false,
    });
  });
});
