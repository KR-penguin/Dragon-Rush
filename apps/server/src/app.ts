import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { loadModelRegistry, type ModelRegistry } from './ai/modelRegistry';
import { getWeightAdapter } from '@dragon-rush/ai';
import type { ServerConfig } from './config';
import { RoomManager } from './rooms/RoomManager';
import { SessionStore } from './session/SessionStore';
import { registerGateway } from './socket/gateway';

export interface ServerHandle {
  url: string;
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

export async function startServer(config: ServerConfig, opts: { models?: ModelRegistry; quiet?: boolean } = {}): Promise<ServerHandle> {
  const log = opts.quiet ? () => {} : (msg: string) => console.log(`[server] ${msg}`);
  const app = Fastify({ logger: false });
  const models = opts.models ?? loadModelRegistry(config.modelsDir, getWeightAdapter(), log);
  const rooms = new RoomManager();

  app.get('/health', async () => ({ ok: true }));
  app.get('/api/models', async () => ({ models: models.list() }));

  if (config.webDistDir) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/socket.io')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  const io = new Server(app.server, { maxHttpBufferSize: 64 * 1024, serveClient: false });
  const gateway = registerGateway(io, { config, sessions: new SessionStore(), rooms, models, log });

  const address = await app.listen({ port: config.port, host: config.host });
  const port = Number(new URL(address).port);
  log(`listening on ${address}${config.webDistDir ? ` (serving ${config.webDistDir})` : ''}`);
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    rooms,
    async close() {
      gateway.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close().catch(() => {});
    },
  };
}
