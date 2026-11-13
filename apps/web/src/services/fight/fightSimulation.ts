import type { CombatSetup } from '@dragon-rush/combat';
import type { FightBotLevel, FightReplay } from '../gameClient';
import { createFightBotSource } from './botInput';
import { LocalSimProvider, simulateFight } from './simProvider';

export interface FightSimulationRequest {
  readonly setup: CombatSetup;
  readonly seed: number;
  readonly level: FightBotLevel;
}

export interface FightWorkerRequest extends FightSimulationRequest {
  readonly id: number;
}
export type FightWorkerResponse =
  | { readonly id: number; readonly replay: FightReplay }
  | { readonly id: number; readonly error: string };

export interface FightSimulationRunner {
  run(request: FightSimulationRequest): FightReplay | Promise<FightReplay>;
  dispose(): void;
}

export function simulateBotFight(request: FightSimulationRequest): FightReplay {
  const { setup, seed, level } = request;
  return simulateFight(setup, seed, [
    createFightBotSource(level, seed, 'a'),
    setup.b ? createFightBotSource(level, seed, 'b') : null,
  ]);
}

/** The fallback yields between small batches when workers are unavailable or blocked. */
export function createBatchedFightSimulation(): FightSimulationRunner {
  const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
  let disposed = false;
  return {
    run({ setup, seed, level }) {
      return new Promise<FightReplay>((resolve, reject) => {
        if (disposed) {
          reject(new Error('fight simulation disposed'));
          return;
        }
        const provider = new LocalSimProvider(setup, seed, [
          createFightBotSource(level, seed, 'a'),
          setup.b ? createFightBotSource(level, seed, 'b') : null,
        ]);
        const cancel = () => {
          provider.dispose();
          reject(new Error('fight simulation disposed'));
        };
        const batch = () => {
          pending.delete(timer);
          try {
            const end = performance.now() + 4;
            do {
              for (let i = 0; i < 8 && !provider.curr.outcome; i++) provider.step();
            } while (!provider.curr.outcome && performance.now() < end);
            const result = provider.result();
            if (result) {
              provider.dispose();
              resolve({ result, ticks: provider.curr.tick, inputs: provider.inputs() });
            } else {
              timer = setTimeout(batch, 0);
              pending.set(timer, cancel);
            }
          } catch (error) {
            provider.dispose();
            reject(error);
          }
        };
        let timer = setTimeout(batch, 0);
        pending.set(timer, cancel);
      });
    },
    dispose() {
      disposed = true;
      for (const [timer, cancel] of pending) {
        clearTimeout(timer);
        cancel();
      }
      pending.clear();
    },
  };
}

/** Owns one reusable worker per local client; Node callers have no UI thread to yield. */
export function createFightSimulationRunner(): FightSimulationRunner {
  if (typeof window === 'undefined') return { run: simulateBotFight, dispose() {} };
  const fallback = createBatchedFightSimulation();
  let worker: Worker | null = null;
  const jobs = new Map<
    number,
    {
      request: FightSimulationRequest;
      resolve: (replay: FightReplay) => void;
      reject: (reason: Error) => void;
    }
  >();
  let next = 1;
  let disposed = false;
  const failWorker = () => {
    worker?.terminate();
    worker = null;
    for (const job of jobs.values()) {
      Promise.resolve(fallback.run(job.request)).then(job.resolve, job.reject);
    }
    jobs.clear();
  };
  try {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./fightSimulation.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<FightWorkerResponse>) => {
        const message = event.data;
        const job = jobs.get(message.id);
        if (!job) return;
        jobs.delete(message.id);
        if ('replay' in message) job.resolve(message.replay);
        else Promise.resolve(fallback.run(job.request)).then(job.resolve, job.reject);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        failWorker();
      };
      worker.onmessageerror = failWorker;
    }
  } catch {
    worker = null;
  }
  return {
    run(request) {
      if (disposed) return Promise.reject(new Error('fight simulation disposed'));
      if (!worker) return fallback.run(request);
      return new Promise<FightReplay>((resolve, reject) => {
        const id = next++;
        jobs.set(id, { request, resolve, reject });
        try {
          worker!.postMessage({ id, ...request } satisfies FightWorkerRequest);
        } catch {
          failWorker();
        }
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const job of jobs.values()) job.reject(new Error('fight simulation disposed'));
      jobs.clear();
      fallback.dispose();
    },
  };
}
