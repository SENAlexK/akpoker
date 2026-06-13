/**
 * SQLite connection (better-sqlite3, synchronous) + Drizzle instance.
 * Sets WAL + foreign keys, applies SQL migrations, seeds system accounts.
 */
import { createId } from '@paralleldrive/cuid2';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

let dbSingleton: DB | null = null;

/** System account labels. */
export const SYSTEM_GRANTS = 'SYSTEM_GRANTS';
export const HOUSE_RAKE = 'HOUSE_RAKE';

function applyMigrations(raw: Database.Database): void {
  raw.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`,
  );
  // Prefer the copied dist/db/migrations; fall back to src (when only `tsc -b` ran).
  let dir = fileURLToPath(new URL('./migrations', import.meta.url));
  if (!existsSync(dir)) {
    const fromSrc = fileURLToPath(new URL('../../src/db/migrations', import.meta.url));
    if (existsSync(fromSrc)) dir = fromSrc;
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = new Set(
    (raw.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const insert = raw.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(dir, file), 'utf8');
    raw.exec('BEGIN');
    try {
      raw.exec(sql);
      insert.run(file, Date.now());
      raw.exec('COMMIT');
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  }
}

function seedSystemAccounts(db: DB): void {
  for (const label of [SYSTEM_GRANTS, HOUSE_RAKE]) {
    const existing = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.label, label))
      .all();
    if (existing.length === 0) {
      db.insert(schema.accounts)
        .values({ id: createId(), type: 'system', label, balance: 0, createdAt: Date.now() })
        .run();
    }
  }
}

export function initDb(env: Env): DB {
  if (dbSingleton) return dbSingleton;
  const dbDir = dirname(resolve(env.DB_PATH));
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  const raw = new Database(resolve(env.DB_PATH));
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  raw.pragma('synchronous = NORMAL');

  applyMigrations(raw);

  const db = drizzle(raw, { schema }) as DB;
  db.$client = raw;
  seedSystemAccounts(db);
  dbSingleton = db;
  return db;
}

export function getDb(): DB {
  if (!dbSingleton) throw new Error('DB not initialized; call initDb() first');
  return dbSingleton;
}

export { schema };
