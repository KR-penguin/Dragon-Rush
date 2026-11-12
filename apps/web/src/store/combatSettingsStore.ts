import { createStore } from 'zustand/vanilla';
import type { FightBotLevel } from '../services/gameClient';
import { readStorage, writeStorage } from '../services/storage';

/** Local real-time combat preferences (persisted). */
export interface CombatSettings {
  /** 빠른 전투: settle fights with the dice rules instead of the real-time screen. */
  readonly fastCombat: boolean;
  readonly botLevel: FightBotLevel;
}

export const DEFAULT_COMBAT_SETTINGS: CombatSettings = { fastCombat: false, botLevel: 'normal' };

const STORAGE_KEY = 'dragon-rush:combat-settings';
const LEVELS: readonly FightBotLevel[] = ['easy', 'normal', 'hard'];

export function parseCombatSettings(raw: string | null): CombatSettings {
  if (!raw) return DEFAULT_COMBAT_SETTINGS;
  try {
    const d = JSON.parse(raw) as unknown;
    if (typeof d !== 'object' || d === null) return DEFAULT_COMBAT_SETTINGS;
    const o = d as Record<string, unknown>;
    return {
      fastCombat:
        typeof o.fastCombat === 'boolean' ? o.fastCombat : DEFAULT_COMBAT_SETTINGS.fastCombat,
      botLevel: LEVELS.includes(o.botLevel as FightBotLevel)
        ? (o.botLevel as FightBotLevel)
        : DEFAULT_COMBAT_SETTINGS.botLevel,
    };
  } catch {
    return DEFAULT_COMBAT_SETTINGS;
  }
}

export interface CombatSettingsState extends CombatSettings {
  update(patch: Partial<CombatSettings>): void;
}

export function createCombatSettingsStore(initial = parseCombatSettings(readStorage(STORAGE_KEY))) {
  const store = createStore<CombatSettingsState>()((set) => ({
    ...initial,
    update: (patch) => set(patch),
  }));
  store.subscribe((s) =>
    writeStorage(STORAGE_KEY, JSON.stringify({ fastCombat: s.fastCombat, botLevel: s.botLevel })),
  );
  return store;
}

export const combatSettings = createCombatSettingsStore();
