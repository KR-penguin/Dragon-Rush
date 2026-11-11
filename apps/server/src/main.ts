import Fastify from 'fastify';

const app = Fastify();
app.get('/health', async () => ({ ok: true }));
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
console.log(`server listening on :${port}`);
