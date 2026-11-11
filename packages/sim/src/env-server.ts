import { createInterface } from 'node:readline';
import { EnvServer } from './env/envServer';

const server = new EnvServer();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  process.stdout.write(server.handle(line) + '\n');
  if (server.closed) {
    rl.close();
  }
});

rl.on('close', () => {
  process.stdout.write('', () => process.exit(0));
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`env-server fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
