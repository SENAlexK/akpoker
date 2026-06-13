import { STARTING_GRANT } from '@akpoker/shared';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'akpoker-test-'));
  process.env.DB_PATH = join(dir, 'test.sqlite');
  process.env.DATA_DIR = dir;
  process.env.AVATAR_DIR = join(dir, 'avatars');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-test-secret-1234';
  process.env.COOKIE_SECRET = 'test-cookie-secret-1234567890';

  const { loadEnv } = await import('../src/config/env.js');
  const { initDb } = await import('../src/db/client.js');
  const { buildApp } = await import('../src/app.js');
  const env = loadEnv();
  const db = initDb(env);
  app = await buildApp(env, db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function cookieHeader(setCookies: string[] | undefined): string {
  return (setCookies ?? []).map((c) => c.split(';')[0]).join('; ');
}

describe('auth flow', () => {
  let cookies: string;

  it('registers a user and grants the starting balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'Alice@Example.com', password: 'hunter2hunter2', nickname: 'Alice' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.nickname).toBe('Alice');
    expect(body.walletPoints).toBe(STARTING_GRANT);
    cookies = cookieHeader(res.cookies?.map((c) => `${c.name}=${c.value}`));
    expect(cookies).toContain('ak_at=');
    expect(cookies).toContain('ak_rt=');
  });

  it('rejects duplicate email and nickname', async () => {
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'alice@example.com', password: 'whatever123', nickname: 'Bob' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('email-taken');
  });

  it('returns the authenticated user from /api/me', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookies } });
    expect(res.statusCode).toBe(200);
    expect(res.json().nickname).toBe('Alice');
  });

  it('rejects /api/me without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'wrongpassword' },
    });
    expect(bad.statusCode).toBe(401);

    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'hunter2hunter2' },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().walletPoints).toBe(STARTING_GRANT);
  });

  it('rotates the refresh token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: cookies } });
    expect(res.statusCode).toBe(200);
    expect(res.json().nickname).toBe('Alice');
  });

  it('serves a default avatar for users without an upload', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookies } });
    const userId = me.json().id;
    const res = await app.inject({ method: 'GET', url: `/api/avatar/${userId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });
});
