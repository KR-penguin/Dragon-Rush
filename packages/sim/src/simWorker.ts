import { parentPort, workerData } from 'node:worker_threads';
import { runBatch, type BatchOptions } from './runner';

parentPort?.postMessage(runBatch(workerData as BatchOptions));
