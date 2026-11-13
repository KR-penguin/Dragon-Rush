import type { FightWorkerRequest, FightWorkerResponse } from './fightSimulation';
import { createFightBotSource } from './botInput';
import { simulateFight } from './simProvider';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<FightWorkerRequest>) => void) | null;
  postMessage(message: FightWorkerResponse, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const replay = simulateFight(data.setup, data.seed, [
      createFightBotSource(data.level, data.seed, 'a'),
      data.setup.b ? createFightBotSource(data.level, data.seed, 'b') : null,
    ]);
    scope.postMessage({ id: data.id, replay }, [replay.inputs.buffer as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
