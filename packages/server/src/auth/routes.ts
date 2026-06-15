/** Auth REST routes: register, login, refresh (rotating), logout, me, change-password. */
import { createId } from '@paralleldrive/cuid2';
import { changePasswordInput, loginInput, registerInput } from '@akpoker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { refreshTokens, users } from '../db/schema.js';
import { findByEmailNorm, findById, findByNicknameNorm, normalizeNickname, toPublicUser } from '../users/repo.js';
import { ECONOMY } from '../config/economy.js';
import { claimDailyTopup, grantStartingTx, hasClaimedDailyBonus } from '../wallet/grants.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import { requireAuth } from './guards.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';
import {
  createRefreshToken,
  hashSecret,
  parseRefreshComposite,
  signAccessToken,
  type AccessClaims,
} from './tokens.js';

const MAX_FAILED = 8;
const LOCK_MS = 15 * 60 * 1000;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, appEnv: env } = app;

  async function issueSession(
    userId: string,
    claims: AccessClaims,
    userAgent: string | undefined,
    reply: FastifyReply,
  ): Promise<void> {
    const access = await signAccessToken(env, claims);
    const refresh = createRefreshToken();
    db.insert(refreshTokens)
      .values({
        id: refresh.id,
        userId,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
        createdAt: Date.now(),
        userAgent: userAgent ?? null,
      })
      .run();
    setAuthCookies(env, reply, access, refresh.composite);
  }

  app.post('/api/auth/register', async (req, reply) => {
    const parsed = registerInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-input', details: parsed.error.issues });
    const { email, password, nickname } = parsed.data;
    const nicknameNorm = normalizeNickname(nickname);

    if (findByEmailNorm(db, email)) return reply.code(409).send({ error: 'email-taken' });
    if (findByNicknameNorm(db, nicknameNorm)) return reply.code(409).send({ error: 'nickname-taken' });

    const id = createId();
    const now = Date.now();
    const passwordHash = await hashPassword(password);
    // Atomic: user row + starting grant succeed or fail together.
    db.transaction((tx) => {
      tx.insert(users)
        .values({
          id,
          email,
          emailNorm: email,
          nickname,
          nicknameNorm,
          passwordHash,
          avatarUrl: null,
          role: 'user',
          status: 'active',
          failedLogins: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      grantStartingTx(tx, id);
    });

    const claims: AccessClaims = { sub: id, nickname, avatarUrl: `/api/avatar/${id}`, role: 'user' };
    await issueSession(id, claims, req.headers['user-agent'], reply);
    const row = findById(db, id)!;
    return reply.code(201).send(toPublicUser(db, row));
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-input' });
    const { email, password } = parsed.data;
    const user = findByEmailNorm(db, email);
    if (!user) return reply.code(401).send({ error: 'invalid-credentials' });
    if (user.status === 'banned') return reply.code(403).send({ error: 'banned' });
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return reply.code(429).send({ error: 'account-locked' });
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      db.update(users)
        .set({
          failedLogins: failed,
          lockedUntil: failed >= MAX_FAILED ? Date.now() + LOCK_MS : null,
          updatedAt: Date.now(),
        })
        .where(eq(users.id, user.id))
        .run();
      return reply.code(401).send({ error: 'invalid-credentials' });
    }

    // Reset counters; rehash if params changed.
    const patch: Partial<typeof users.$inferInsert> = { failedLogins: 0, lockedUntil: null, updatedAt: Date.now() };
    if (needsRehash(user.passwordHash)) patch.passwordHash = await hashPassword(password);
    db.update(users).set(patch).where(eq(users.id, user.id)).run();

    const claims: AccessClaims = {
      sub: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl ?? `/api/avatar/${user.id}`,
      role: user.role,
    };
    await issueSession(user.id, claims, req.headers['user-agent'], reply);
    return reply.send(toPublicUser(db, { ...user, ...patch } as typeof user));
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const composite = req.cookies[REFRESH_COOKIE];
    if (!composite) return reply.code(401).send({ error: 'no-refresh' });
    const parsed = parseRefreshComposite(composite);
    if (!parsed) return reply.code(401).send({ error: 'bad-refresh' });

    const row = db.select().from(refreshTokens).where(eq(refreshTokens.id, parsed.id)).get();
    if (!row || row.tokenHash !== hashSecret(parsed.secret)) {
      clearAuthCookies(env, reply);
      return reply.code(401).send({ error: 'bad-refresh' });
    }
    if (row.revokedAt) {
      // Reuse of a revoked token → revoke the whole family (token theft).
      db.update(refreshTokens)
        .set({ revokedAt: Date.now() })
        .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)))
        .run();
      clearAuthCookies(env, reply);
      return reply.code(401).send({ error: 'refresh-reused' });
    }
    if (row.expiresAt < Date.now()) {
      clearAuthCookies(env, reply);
      return reply.code(401).send({ error: 'refresh-expired' });
    }

    const user = findById(db, row.userId);
    if (!user || user.status === 'banned') {
      clearAuthCookies(env, reply);
      return reply.code(401).send({ error: 'no-user' });
    }

    // Rotate: revoke old, issue new.
    const next = createRefreshToken();
    db.insert(refreshTokens)
      .values({
        id: next.id,
        userId: user.id,
        tokenHash: next.tokenHash,
        expiresAt: next.expiresAt,
        createdAt: Date.now(),
        userAgent: req.headers['user-agent'] ?? null,
      })
      .run();
    db.update(refreshTokens)
      .set({ revokedAt: Date.now(), replacedBy: next.id })
      .where(eq(refreshTokens.id, row.id))
      .run();

    const claims: AccessClaims = {
      sub: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl ?? `/api/avatar/${user.id}`,
      role: user.role,
    };
    const access = await signAccessToken(env, claims);
    setAuthCookies(env, reply, access, next.composite);
    return reply.send(toPublicUser(db, user));
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const composite = req.cookies[REFRESH_COOKIE];
    const parsed = composite ? parseRefreshComposite(composite) : null;
    if (parsed) {
      db.update(refreshTokens).set({ revokedAt: Date.now() }).where(eq(refreshTokens.id, parsed.id)).run();
    }
    clearAuthCookies(env, reply);
    return reply.send({ ok: true });
  });

  app.get('/api/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = findById(db, req.user!.sub);
    if (!user) return reply.code(404).send({ error: 'not-found' });
    return reply.send(toPublicUser(db, user));
  });

  app.post('/api/auth/change-password', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = changePasswordInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-input' });
    const user = findById(db, req.user!.sub);
    if (!user) return reply.code(404).send({ error: 'not-found' });
    if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
      return reply.code(403).send({ error: 'wrong-password' });
    }
    db.update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: Date.now() })
      .where(eq(users.id, user.id))
      .run();
    // Revoke all other sessions.
    db.update(refreshTokens).set({ revokedAt: Date.now() }).where(eq(refreshTokens.userId, user.id)).run();
    clearAuthCookies(env, reply);
    return reply.send({ ok: true });
  });

  app.get('/api/wallet/daily-status', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send({ available: !hasClaimedDailyBonus(db, req.user!.sub), amount: ECONOMY.DAILY_BONUS });
  });

  app.post('/api/wallet/daily-topup', { preHandler: requireAuth }, async (req, reply) => {
    const result = claimDailyTopup(db, req.user!.sub);
    return reply.send(result);
  });
}
