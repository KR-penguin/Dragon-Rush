export const BOARD_SIZE = 24;
export const START_TILE = 0;

export const advance = (from: number, steps: number): number => (from + steps) % BOARD_SIZE;

export const passesStart = (from: number, steps: number): boolean => from + steps >= BOARD_SIZE;

export const forwardDistance = (from: number, to: number): number =>
  (((to - from) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
