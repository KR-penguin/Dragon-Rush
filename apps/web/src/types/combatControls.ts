import { NO_INPUT, type FighterInput, type MoveDir } from '@dragon-rush/combat';

/**
 * Combat controls (combat-design §2.2): key layouts read by `KeyboardEvent.code`, so they work with
 * any keyboard language and during Korean IME composition. Shift/Ctrl/Alt/Tab/Meta are never used.
 */
export type ControlLayoutId = 'p1' | 'p2' | 'solo';

export interface KeyLayout {
  readonly id: ControlLayoutId;
  readonly label: string;
  readonly up: readonly string[];
  readonly down: readonly string[];
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly attack: readonly string[];
  readonly skill: readonly string[];
  readonly dash: readonly string[];
}

export const KEY_LAYOUTS: Readonly<Record<ControlLayoutId, KeyLayout>> = {
  p1: {
    id: 'p1',
    label: 'P1 (도착자·왼쪽)',
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    attack: ['KeyF'],
    skill: ['KeyG'],
    dash: ['KeyH'],
  },
  // The laptop row (, . /) is always live next to the numpad, so no setting is needed.
  p2: {
    id: 'p2',
    label: 'P2 (방어자·오른쪽)',
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    attack: ['Numpad1', 'Comma'],
    skill: ['Numpad2', 'Period'],
    dash: ['Numpad3', 'Slash'],
  },
  solo: {
    id: 'solo',
    label: '혼자 (vs 봇·용)',
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    attack: ['KeyJ', 'KeyZ'],
    skill: ['KeyK', 'KeyX'],
    dash: ['KeyL', 'KeyC', 'Space'],
  },
};

export const CONTROL_ACTIONS = ['up', 'down', 'left', 'right', 'attack', 'skill', 'dash'] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export const ACTION_LABEL: Readonly<Record<ControlAction, string>> = {
  up: '위',
  down: '아래',
  left: '왼쪽',
  right: '오른쪽',
  attack: '공격',
  skill: '스킬',
  dash: '대시',
};

/** Every code a layout listens to (for preventDefault and the keyboard test). */
export function layoutCodes(layout: KeyLayout): string[] {
  return CONTROL_ACTIONS.flatMap((a) => layout[a]);
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
};

/** Keycap text for a `KeyboardEvent.code` (KeyW → W, Numpad1 → Num1, Comma → ,). */
export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** dy = -1 | 0 | 1 rows, dx = -1 | 0 | 1 columns → 0 = none, 1..8 = N, NE, E, SE, S, SW, W, NW. */
const DIR_GRID: readonly (readonly MoveDir[])[] = [
  [8, 1, 2],
  [7, 0, 3],
  [6, 5, 4],
];

/** Opposite directions cancel (A+D = no horizontal move), diagonals combine. */
export function dirFromAxes(up: boolean, down: boolean, left: boolean, right: boolean): MoveDir {
  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);
  return DIR_GRID[dy + 1]![dx + 1]!;
}

/** Input levels for one layout; `active(code)` says whether the key counts as held this tick. */
export function inputFromKeys(layout: KeyLayout, active: (code: string) => boolean): FighterInput {
  const any = (codes: readonly string[]) => codes.some(active);
  return {
    move: dirFromAxes(any(layout.up), any(layout.down), any(layout.left), any(layout.right)),
    attack: any(layout.attack),
    skill: any(layout.skill),
    dash: any(layout.dash),
  };
}

export const STICK_DEADZONE = 0.35;

/** 8-way quantised analog stick (screen space, y down) with a radial dead zone. */
export function quantizeStick(x: number, y: number, deadzone = STICK_DEADZONE): MoveDir {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < deadzone) return 0;
  const sector = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8; // 0 = E, 2 = S, 6 = N
  return (((sector + 2) % 8) + 1) as MoveDir;
}

/** Standard-mapping gamepad buttons (W3C Gamepad "standard" layout). */
export const PAD_BUTTON = {
  south: 0,
  east: 1,
  west: 2,
  rb: 5,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export interface PadSnapshot {
  readonly axes: readonly number[];
  readonly pressed: readonly boolean[];
}

/** Attack = South, Skill = West, Dash = East or RB; the D-pad wins over the stick when pressed. */
export function inputFromPad(pad: PadSnapshot): FighterInput {
  const b = (i: number) => pad.pressed[i] === true;
  const dpad = dirFromAxes(
    b(PAD_BUTTON.up),
    b(PAD_BUTTON.down),
    b(PAD_BUTTON.left),
    b(PAD_BUTTON.right),
  );
  return {
    move: dpad !== 0 ? dpad : quantizeStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0),
    attack: b(PAD_BUTTON.south),
    skill: b(PAD_BUTTON.west),
    dash: b(PAD_BUTTON.east) || b(PAD_BUTTON.rb),
  };
}

/** Keyboard and gamepad together: first non-zero direction wins, buttons are OR-ed. */
export function mergeInputs(inputs: readonly FighterInput[]): FighterInput {
  let move: MoveDir = 0;
  let attack = false;
  let skill = false;
  let dash = false;
  for (const i of inputs) {
    if (move === 0) move = i.move;
    attack ||= i.attack;
    skill ||= i.skill;
    dash ||= i.dash;
  }
  return move === 0 && !attack && !skill && !dash ? NO_INPUT : { move, attack, skill, dash };
}

/** One byte per input for replays: move in bits 0-3, attack/skill/dash in bits 4-6. */
export function packInput(i: FighterInput): number {
  return i.move | (i.attack ? 16 : 0) | (i.skill ? 32 : 0) | (i.dash ? 64 : 0);
}

export function unpackInput(byte: number): FighterInput {
  const move = (byte & 15) as MoveDir;
  return {
    move: move > 8 ? 0 : move,
    attack: (byte & 16) !== 0,
    skill: (byte & 32) !== 0,
    dash: (byte & 64) !== 0,
  };
}
