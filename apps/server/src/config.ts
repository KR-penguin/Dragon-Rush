import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ServerConfig {
  port: number;
  host: string;
  turnTimeoutMs: number;
  reconnectGraceMs: number;
  botActionDelayMs: number;
  maxConsecutiveTimeouts: number;
  modelsDir: string;
  webDistDir: string | null;
  roomTtlMs: number;
  messagesPerSecond: number;
}

const num = (v: string | undefined, fallback: number) =>
  v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ServerConfig {
  const root = findRepoRoot(cwd);
  const webDist = env.WEB_DIST_DIR ?? resolve(root, 'apps/web/dist');
  return {
    port: num(env.PORT, 3001),
    host: env.HOST ?? '0.0.0.0',
    turnTimeoutMs: num(env.TURN_TIMEOUT_MS, 60_000),
    reconnectGraceMs: num(env.RECONNECT_GRACE_MS, 60_000),
    botActionDelayMs: num(env.BOT_ACTION_DELAY_MS, 700),
    maxConsecutiveTimeouts: 3,
    modelsDir: env.MODELS_DIR ?? resolve(root, 'models'),
    webDistDir: existsSync(resolve(webDist, 'index.html')) ? webDist : null,
    roomTtlMs: num(env.ROOM_TTL_MS, 10 * 60_000),
    messagesPerSecond: num(env.MESSAGES_PER_SECOND, 20),
  };
}

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  return resolve(start);
}
