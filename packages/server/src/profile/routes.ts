/** Profile routes: update nickname, upload/delete avatar, serve avatar (with default). */
import { updateProfileInput } from '@akpoker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { users } from '../db/schema.js';
import { findById, findByNicknameNorm, normalizeNickname, toPublicUser } from '../users/repo.js';
import { defaultAvatarSvg, readStoredAvatar, storeAvatar } from './avatar.js';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const { db, appEnv: env } = app;

  app.patch('/api/profile', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = updateProfileInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-input' });
    const user = findById(db, req.user!.sub);
    if (!user) return reply.code(404).send({ error: 'not-found' });

    if (parsed.data.nickname && parsed.data.nickname !== user.nickname) {
      const norm = normalizeNickname(parsed.data.nickname);
      const clash = findByNicknameNorm(db, norm);
      if (clash && clash.id !== user.id) return reply.code(409).send({ error: 'nickname-taken' });
      db.update(users)
        .set({ nickname: parsed.data.nickname, nicknameNorm: norm, updatedAt: Date.now() })
        .where(eq(users.id, user.id))
        .run();
    }
    return reply.send(toPublicUser(db, findById(db, user.id)!));
  });

  app.post('/api/profile/avatar', { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_AVATAR_BYTES } });
    if (!file) return reply.code(400).send({ error: 'no-file' });
    const buf = await file.toBuffer();
    let url: string;
    try {
      url = await storeAvatar(env.AVATAR_DIR, req.user!.sub, buf);
    } catch {
      return reply.code(400).send({ error: 'unsupported-image' });
    }
    db.update(users).set({ avatarUrl: url, updatedAt: Date.now() }).where(eq(users.id, req.user!.sub)).run();
    return reply.send(toPublicUser(db, findById(db, req.user!.sub)!));
  });

  app.delete('/api/profile/avatar', { preHandler: requireAuth }, async (req, reply) => {
    db.update(users).set({ avatarUrl: null, updatedAt: Date.now() }).where(eq(users.id, req.user!.sub)).run();
    return reply.send(toPublicUser(db, findById(db, req.user!.sub)!));
  });

  // Public: serve a user's avatar, falling back to a deterministic identicon.
  app.get<{ Params: { userId: string } }>('/api/avatar/:userId', async (req, reply) => {
    const { userId } = req.params;
    const stored = await readStoredAvatar(env.AVATAR_DIR, userId);
    if (stored) {
      return reply.header('Content-Type', 'image/webp').header('Cache-Control', 'public, max-age=300').send(stored);
    }
    return reply
      .header('Content-Type', 'image/svg+xml')
      .header('Cache-Control', 'public, max-age=300')
      .send(defaultAvatarSvg(userId));
  });
}
