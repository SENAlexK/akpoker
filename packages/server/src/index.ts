/** @akpoker/server entrypoint: load env, open DB, build Fastify, attach Socket.IO, listen. */
import { loadEnv } from './config/env.js';
import { initDb } from './db/client.js';
import { buildApp } from './app.js';
import { attachRealtime } from './realtime/io.js';
import { registerAdminRoutes } from './admin/routes.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = initDb(env);
  const app = await buildApp(env, db);

  // Socket.IO is attached to Fastify's raw HTTP server BEFORE listen().
  const realtime = attachRealtime(app, env, db);

  // Admin routes that act on the live game (need the RoomManager from realtime).
  registerAdminRoutes(app, realtime.rooms);

  app.addHook('preClose', (done) => {
    realtime.io.local.disconnectSockets(true);
    done();
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`received ${signal}, shutting down`);
    // Hard cap: exit within 3s even if a close hangs (open WS, etc.).
    const force = setTimeout(() => process.exit(0), 3000);
    if (typeof force === 'object' && 'unref' in force) force.unref();
    realtime.io.close(); // drop socket.io connections so the HTTP server can close
    void app.close().finally(() => {
      try {
        db.$client.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: env.HOST });
  const scheme = env.HTTPS_KEY_PATH && env.HTTPS_CERT_PATH ? 'https' : 'http';
  app.log.info(`AK Poker server listening on ${scheme}://${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  console.error('fatal boot error:', err);
  process.exit(1);
});
