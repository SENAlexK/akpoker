/** Build the Fastify instance: plugins, decorations, REST routes, health checks. */
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { allowedOrigins, type Env } from './config/env.js';
import { authRoutes } from './auth/routes.js';
import { profileRoutes } from './profile/routes.js';
import type { DB } from './db/client.js';

export async function buildApp(env: Env, db: DB): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : env.NODE_ENV === 'production'
          ? { level: 'info' }
          : { level: 'debug', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
  });

  app.decorate('db', db);
  app.decorate('appEnv', env);

  await app.register(helmet, {
    contentSecurityPolicy: false, // SPA + websockets; CSP tuned at the proxy
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, { origin: allowedOrigins(env), credentials: true });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async () => {
    db.$client.prepare('SELECT 1').get();
    return { ok: true };
  });

  await app.register(authRoutes);
  await app.register(profileRoutes);

  // Optionally serve the built SPA (single-origin deploy).
  if (env.SERVE_WEB) {
    const webDist = resolve(env.WEB_DIST);
    if (existsSync(webDist)) {
      await app.register(staticPlugin, { root: webDist, wildcard: false });
      app.setNotFoundHandler((req, reply) => {
        if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/socket.io')) {
          return reply.code(404).send({ error: 'not-found' });
        }
        return reply.sendFile('index.html');
      });
    }
  }

  return app;
}
