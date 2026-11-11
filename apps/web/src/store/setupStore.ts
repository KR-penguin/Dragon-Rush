import { createStore } from 'zustand/vanilla';
import { defaultSetup, type SetupForm } from '../types/setupForm';

/** Keeps the last local setup so returning to the setup screen shows the previous table. */
export interface SetupStoreState {
  form: SetupForm;
  setForm(form: SetupForm): void;
}

export const setupStore = createStore<SetupStoreState>()((set) => ({
  form: defaultSetup(),
  setForm(form) {
    set({ form });
  },
}));
