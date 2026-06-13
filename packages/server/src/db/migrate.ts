/** Standalone migration runner: `pnpm db:migrate`. */
import { loadEnv } from '../config/env.js';
import { initDb } from './client.js';

const env = loadEnv();
initDb(env);
console.log(`Migrations applied. DB at ${env.DB_PATH}`);
process.exit(0);
