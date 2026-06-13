import type { Env } from '../config/env.js';
import type { DB } from '../db/client.js';
import type { AccessClaims } from '../auth/tokens.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
    appEnv: Env;
  }
  interface FastifyRequest {
    user?: AccessClaims;
  }
}
