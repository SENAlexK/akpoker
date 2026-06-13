/** @akpoker/server entrypoint: load env, open DB, build Fastify, attach Socket.IO, listen. */
import { loadEnv } from './config/env.js';
import { initDb } from './db/client.js';
import { buildApp } from './app.js';
import { attachRealtime } from './realtime/io.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = initDb(env);
  const app = await buildApp(env, db);

  // Socket.IO is attached to Fastify's raw HTTP server BEFORE listen().
  const realtime = attachRealtime(app, env, db);

  app.addHook('preClose', (done) => {
    realtime.io.local.disconnectSockets(true);
    done();
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    db.$client.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`AK Poker server listening on ${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  console.error('fatal boot error:', err);
  process.exit(1);
});
