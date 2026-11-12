import { createInterface } from 'node:readline';
import { CombatEnvServer } from './combat-env/server';

// stdout carries protocol lines only; diagnostics go to stderr
const server = new CombatEnvServer();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  process.stdout.write(server.handle(line) + '\n');
  if (server.closed) rl.close();
});

rl.on('close', () => {
  process.stdout.write('', () => process.exit(0));
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`combat-env-server fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
