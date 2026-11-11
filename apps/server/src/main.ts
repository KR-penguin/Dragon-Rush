import { startServer } from './app';
import { loadConfig } from './config';

const server = await startServer(loadConfig());

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
