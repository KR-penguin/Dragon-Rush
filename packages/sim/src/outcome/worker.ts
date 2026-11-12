import { parentPort, workerData } from 'node:worker_threads';
import { generateOutcomeRows, type GenerateOutcomeOptions } from './index';
import type { StatDist } from '../statDist';

const data = workerData as { dist: StatDist; options: GenerateOutcomeOptions };
parentPort?.postMessage(generateOutcomeRows(data.dist, data.options));
