import { useStore } from 'zustand';
import { LocalGameClient } from '../services/LocalGameClient';
import { navStore } from '../store/navStore';
import { setupStore } from '../store/setupStore';
import {
  setSeatCount,
  setupErrors,
  toLocalConfig,
  updateSeat,
  type SeatForm,
  type SetupForm,
} from '../types/setupForm';

/** Local setup form state plus starting a LocalGameClient game. */
export function useLocalSetup() {
  const form = useStore(setupStore, (s) => s.form);
  const setForm = (next: SetupForm) => setupStore.getState().setForm(next);
  const errors = setupErrors(form);

  const start = () => {
    if (errors.length > 0) return;
    const config = toLocalConfig(form);
    // No seed: every game, including "다시 하기", gets a fresh random seed.
    const create = () => new LocalGameClient({ seats: config.seats, maxRounds: config.maxRounds });
    navStore.getState().openGame(create(), { restart: create, exitTo: 'home' });
  };

  return {
    form,
    errors,
    setSeatCount: (n: number) => setForm(setSeatCount(form, n)),
    updateSeat: (index: number, patch: Partial<SeatForm>) =>
      setForm(updateSeat(form, index, patch)),
    setMaxRounds: (maxRounds: number | null) => setForm({ ...form, maxRounds }),
    start,
  };
}
